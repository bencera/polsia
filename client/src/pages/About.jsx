import { Link } from 'react-router-dom';
import './About.css';

function About() {
  return (
    <div className="about-container">
      <div className="about-content">
        <Link to="/" className="back-link">← Back to Home</Link>

        <h1>About Polsia</h1>

        <div className="about-story">
          <p>
            When I was thirty-nine, forty, when I really started to build products<br />
            I definitely wanted to build companies that could run themselves<br />
            It was almost impossible because the dream was so big<br />
            That I didn't see any chance because
          </p>

          <p>
            I was living between Paris and San Francisco; was working alone<br />
            And when I finally broke away from the idea of building one app at a time and started building Polsia<br />
            I thought, "Well, now I may have a little bit of a chance"<br />
            Because all I really wanted to do was create systems<br />
            And not only build them, but make them think for themselves
          </p>

          <p>
            At that time, around '24, '25, AI was exploding<br />
            So, I would stay up all night, writing code, designing, testing loops<br />
            Running maybe five or six small SaaS products<br />
            I think I had about seven, eight modules<br />
            I would partially sleep on the couch<br />
            Because I didn't want to stop building, and that kept me going for about<br />
            Almost two years in the beginning
          </p>

          <p>
            I wanted to create a platform that could build companies the way people build apps<br />
            The way people used to build startups in the 2010s<br />
            And then have a system that could build the future<br />
            And I said, "Wait a second, I know the Claude Agent SDK<br />
            Why don't I use the Claude Agent SDK as the operating system of the company?"<br />
            And I didn't have any idea what it would become<br />
            But I knew I needed agents, so I built loops and connected APIs<br />
            Which then were synced to real products running in production<br />
            I knew that could be the company of the future<br />
            But I didn't realize how much the impact would be
          </p>

          <p>
            My name is Ben Cera<br />
            But everybody calls me Ben
          </p>

          <p>
            Once you free your mind about the concept of Work<br />
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
