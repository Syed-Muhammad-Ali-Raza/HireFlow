import { evaluateResume } from '../lib/ai';

async function testAI() {
  console.log('Testing HireFlow AI matching utility...');

  const jdText = `
  Position: Senior Front End Developer
  Required Skills: React, TypeScript, Next.js, Tailwind CSS, REST API
  Responsibilities: Build premium responsive layouts, optimize load times, work closely with product managers.
  `;

  const resumeText = `
  Name: John Dev
  Experience: 4 years as a frontend engineer.
  Skills: React, HTML, CSS, JavaScript, Tailwind CSS, Git.
  Projects: Built several Next.js applications and integrated REST APIs.
  `;

  try {
    const result = await evaluateResume(jdText, resumeText);
    console.log('\nAI MATCHING EVALUATION RESULT:');
    console.log('-----------------------------');
    console.log(`Match Score: ${result.match_score}/100`);
    console.log(`Matched Skills: ${result.matched_skills.join(', ')}`);
    console.log(`Missing Skills: ${result.missing_skills.join(', ')}`);
    console.log(`Reasoning:\n${result.match_reasoning}`);
    console.log('-----------------------------');
    console.log('Test completed successfully.');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testAI();
