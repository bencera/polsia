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

  // Check for running executions on mount and when token changes
  useEffect(() => {
    if (!token) {
      return;
    }

    checkForRunningExecutions();
  }, [token]);

  // Check if there are any currently running executions
  const checkForRunningExecutions = async () => {
    try {
      // Get all modules
      const modulesResponse = await fetch('/api/modules', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!modulesResponse.ok) {
        return;
      }

      const modulesData = await modulesResponse.json();
      const modules = modulesData.modules || [];

      // Check each module for running executions
      for (const module of modules) {
        const executionsResponse = await fetch(`/api/modules/${module.id}/executions?limit=1`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!executionsResponse.ok) {
          continue;
        }

        const executionsData = await executionsResponse.json();
        const latestExecution = executionsData.executions?.[0];

        // If we found a running execution, connect to it
        if (latestExecution && latestExecution.status === 'running') {
          console.log('[TerminalContext] Found running execution:', latestExecution.id);

          // Load existing logs
          const logsResponse = await fetch(`/api/modules/${module.id}/executions/${latestExecution.id}/logs`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (logsResponse.ok) {
            const logsData = await logsResponse.json();
            if (logsData.logs && logsData.logs.length > 0) {
              setTerminalLogs(logsData.logs);
            }
          }

          // Start streaming
          startLogStream(module.id, latestExecution.id);
          return; // Only connect to the first running execution we find
        }

        // If no running execution, load latest completed logs
        if (latestExecution && (latestExecution.status === 'completed' || latestExecution.status === 'failed')) {
          const logsResponse = await fetch(`/api/modules/${module.id}/executions/${latestExecution.id}/logs`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (logsResponse.ok) {
            const logsData = await logsResponse.json();
            if (logsData.logs && logsData.logs.length > 0) {
              setTerminalLogs(logsData.logs);
              return; // Load logs from first module with execution history
            }
          }
        }
      }
    } catch (err) {
      console.error('[TerminalContext] Error checking for running executions:', err);
    }
  };

  // Start streaming logs for a specific execution
  const startLogStream = (moduleId, executionId) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      console.log('[TerminalContext] Closing existing SSE connection');
      eventSourceRef.current.close();
    }

    const streamUrl = `/api/modules/${moduleId}/executions/${executionId}/logs/stream?token=${token}`;
    console.log('[TerminalContext] Connecting to SSE:', streamUrl);

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    setActiveExecutionId(executionId);
    setActiveModuleId(moduleId);

    eventSource.onopen = () => {
      console.log('[TerminalContext] SSE connection opened');
    };

    eventSource.onmessage = (event) => {
      console.log('[TerminalContext] Received message:', event.data);
      try {
        const log = JSON.parse(event.data);

        // Check if this is a completion event
        if (log.type === 'completion') {
          console.log('[TerminalContext] Execution completed:', log.status);
          setActiveExecutionId(null);
          setActiveModuleId(null);
          eventSource.close();
          eventSourceRef.current = null;
          return;
        }

        // Add log to terminal (keep last 100 logs)
        console.log('[TerminalContext] Adding log to terminal:', log.message);
        setTerminalLogs(prev => [...prev, log].slice(-100));
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        console.log('[TerminalContext] Cleaning up SSE connection');
        eventSourceRef.current.close();
      }
    };
  }, []);

  const value = {
    terminalLogs,
    activeExecutionId,
    activeModuleId,
    runModule,
    isStreaming: activeExecutionId !== null,
  };

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}
