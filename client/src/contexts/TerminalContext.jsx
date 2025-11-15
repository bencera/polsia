import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

const TerminalContext = createContext();

export function useTerminal() {
  return useContext(TerminalContext);
}

export function TerminalProvider({ children }) {
  const { token } = useAuth();
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [activeExecutionId, setActiveExecutionId] = useState(null);
  const [activeModuleId, setActiveModuleId] = useState(null);
  const eventSourceRef = useRef(null);

  // Auto-connect to company-wide stream on mount
  useEffect(() => {
    if (!token) {
      return;
    }

    connectToCompanyStream();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        console.log('[TerminalContext] Cleaning up company-wide SSE connection');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [token]);

  // Connect to company-wide stream (all executions for this user)
  const connectToCompanyStream = () => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      console.log('[TerminalContext] Closing existing SSE connection');
      eventSourceRef.current.close();
    }

    const streamUrl = `/api/executions/stream?token=${token}`;
    console.log('[TerminalContext] Connecting to company-wide stream:', streamUrl);

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[TerminalContext] Company-wide SSE connection opened');
    };

    eventSource.onmessage = (event) => {
      console.log('[TerminalContext] Received message:', event.data);
      try {
        const data = JSON.parse(event.data);

        // Check if this is a completion event
        if (data.type === 'completion') {
          console.log('[TerminalContext] Execution completed:', data.status, 'for execution', data.execution_id);
          return;
        }

        // Add log to terminal (keep last 100 logs)
        console.log('[TerminalContext] Adding log to terminal');
        setTerminalLogs(prev => [...prev, data].slice(-100));
      } catch (err) {
        console.error('[TerminalContext] Error parsing log:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[TerminalContext] Company-wide SSE connection error:', err);
      console.error('[TerminalContext] EventSource readyState:', eventSource.readyState);
      eventSource.close();
      eventSourceRef.current = null;
    };
  };

  // Start streaming logs for a specific execution
  const startLogStream = (moduleOrRoutineId, executionId, isRoutine = false) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      console.log('[TerminalContext] Closing existing SSE connection');
      eventSourceRef.current.close();
    }

    // Use different endpoint for routines vs modules
    const endpoint = isRoutine ? 'routines' : 'modules';
    const streamUrl = `/api/${endpoint}/${moduleOrRoutineId}/executions/${executionId}/logs/stream?token=${token}`;
    console.log('[TerminalContext] Connecting to SSE:', streamUrl);

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    setActiveExecutionId(executionId);
    setActiveModuleId(moduleOrRoutineId);

    eventSource.onopen = () => {
      console.log('[TerminalContext] SSE connection opened');
    };

    eventSource.onmessage = (event) => {
      console.log('[TerminalContext] Received message:', event.data);
      try {
        const data = JSON.parse(event.data);

        // Check if this is a completion event
        if (data.type === 'completion') {
          console.log('[TerminalContext] Execution completed:', data.status);
          setActiveExecutionId(null);
          setActiveModuleId(null);
          eventSource.close();
          eventSourceRef.current = null;
          return;
        }

        // Handle both single log object and array of logs
        const logsToAdd = data.logs ? data.logs : [data];

        // Add log(s) to terminal (keep last 100 logs)
        console.log('[TerminalContext] Adding logs to terminal:', logsToAdd.length);
        setTerminalLogs(prev => [...prev, ...logsToAdd].slice(-100));
      } catch (err) {
        console.error('[TerminalContext] Error parsing log:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[TerminalContext] SSE connection error:', err);
      console.error('[TerminalContext] EventSource readyState:', eventSource.readyState);
      eventSource.close();
      eventSourceRef.current = null;
      setActiveExecutionId(null);
      setActiveModuleId(null);
    };
  };

  // Manually trigger a module execution (called from Modules page)
  const runModule = async (moduleId, moduleName) => {
    try {
      // Add a starting log message instead of clearing
      const startLog = {
        id: Date.now(), // Temporary ID
        timestamp: new Date().toISOString(),
        log_level: 'info',
        stage: 'init',
        message: `Starting execution: ${moduleName}`
      };
      setTerminalLogs(prev => [...prev, startLog]);

      const response = await fetch(`/api/modules/${moduleId}/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to trigger module execution');
      }

      // Wait for execution to start, then get execution ID
      setTimeout(async () => {
        try {
          const execResponse = await fetch(`/api/modules/${moduleId}/executions?limit=1`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!execResponse.ok) {
            throw new Error('Failed to fetch execution ID');
          }

          const execData = await execResponse.json();
          const latestExecution = execData.executions?.[0];

          if (latestExecution) {
            startLogStream(moduleId, latestExecution.id);
          }
        } catch (err) {
          console.error('[TerminalContext] Error getting execution ID:', err);
        }
      }, 500);

      return true;
    } catch (err) {
      console.error('[TerminalContext] Error running module:', err);
      return false;
    }
  };

  // Manually trigger a routine execution (called from Routines page)
  const runRoutine = async (agentId, agentName) => {
    try {
      // Add a starting log message
      const startLog = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        log_level: 'info',
        stage: 'init',
        message: `Starting agent: ${agentName}`
      };
      setTerminalLogs(prev => [...prev, startLog]);

      const response = await fetch(`/api/modules/${agentId}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to trigger agent execution');
      }

      const data = await response.json();

      // Get the execution ID from the response and start streaming logs
      if (data.execution && data.execution.id) {
        // Start streaming logs for this agent execution
        startLogStream(agentId, data.execution.id, false);

        const successLog = {
          id: Date.now() + 1,
          timestamp: new Date().toISOString(),
          log_level: 'info',
          stage: 'triggered',
          message: `Agent "${agentName}" triggered successfully (Execution ID: ${data.execution.id})`
        };
        setTerminalLogs(prev => [...prev, successLog]);
      }

      return true;
    } catch (err) {
      console.error('[TerminalContext] Error running agent:', err);
      const errorLog = {
        id: Date.now() + 2,
        timestamp: new Date().toISOString(),
        log_level: 'error',
        stage: 'error',
        message: `Failed to run agent: ${err.message}`
      };
      setTerminalLogs(prev => [...prev, errorLog]);
      return false;
    }
  };

  const value = {
    terminalLogs,
    activeExecutionId,
    activeModuleId,
    runModule,
    runRoutine,
    isStreaming: activeExecutionId !== null,
  };

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}
