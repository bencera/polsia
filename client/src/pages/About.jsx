import { Link } from 'react-router-dom';
import './About.css';

function About() {
  return (
    <div className="about-container">
      <audio autoPlay loop>
        <source src="/audio/background.wav" type="audio/wav" />
        Your browser does not support the audio element.
      </audio>
      <div className="about-content">
        <Link to="/" className="back-link">← Back to Home</Link>

        <div className="about-story">
          <p>
            When I was 38, 39, when I really started to build AI products<br />
            I definitely wanted to build companies that could run themselves<br />
            It was almost impossible because the dream was so big<br />
            That I didn't see any chance because
          </p>

          <p>
            I was living between Paris, LA and San Francisco; was working alone<br />
            And when I finally broke away from the idea of building products manually and used AI<br />
            I thought, "Well, now I may have a little bit of a chance"<br />
            Because all I really wanted to do was build products<br />
            And not only build them, but make them think for themselves
          </p>

          <p>
            At that time, in San Francisco, in '24, '25, they already had AI<br />
            So, I would stay up all night, writing code with AI<br />
            Building apps in like 2 hours,<br />
            I think I built about seven, eight apps<br />
            I would partially sleep on the couch<br />
            Because I didn't want to stop building, and that kept me going for about<br />
            Almost two years in the beginning
          </p>

          <p>
            I wanted to create a platform with the vibes of the 1990s, the vibes of the 2000s,<br />
            of the 2010s, and then have a feature of the future,<br />
            And I said, "Wait a second, I know the Agent SDK<br />
            Why don't I use the Agent SDK which is the feature of the future?"<br />
            And I didn't have any idea what to do,<br />
            But I knew I needed agents, so I put agents in loops and connected MCPs<br />
            Which then were synced to real products running in production<br />
            I knew that could be a feature of the future<br />
            But I didn't realize how much the impact would be
          </p>

          <p>
            My name is Victor-Benjamin<br />
            But everybody calls me <a href="https://x.com/bencera_" target="_blank" rel="noopener noreferrer">Ben</a>
          </p>

          <p>
            Once you free your mind about the concept of a company<br />
            and what it means to build a company "the right way"<br />
            You can do whatever you want<br />
            So nobody told me what to build<br />
            And there was no preconception of what to build
          </p>
        </div>
      </div>
    </div>
  );
}

export default About;
