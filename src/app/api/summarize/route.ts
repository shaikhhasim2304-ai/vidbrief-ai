import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export async function POST(req: NextRequest) {
  try {
    const { url, language = 'English' } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ 
        error: 'GROQ_API_KEY is not set in the environment variables.' 
      }, { status: 500 });
    }

    // 1. Extract Transcript
    let transcriptItems;
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (err) {
      console.error('Transcript fetch error:', err);
      return NextResponse.json({ 
        error: 'Could not fetch transcript. The video might not have captions enabled or is age-restricted.' 
      }, { status: 400 });
    }

    const fullTranscript = transcriptItems.map(item => item.text).join(' ');
    
    // Trim to ~40k characters to fit comfortably in context
    const trimmedTranscript = fullTranscript.slice(0, 40000); 

    // 2. Process with Groq LLM (llama-3.3-70b-versatile)
    const systemPrompt = `You are an expert AI summarizer. Read the following YouTube video transcript and generate a structured summary.
CRITICAL INSTRUCTION: You MUST translate ALL generated content (title, executive summary, highlights, deep dive, actionables) into the following language: ${language}.
Even if the original transcript is in English, write the final output strictly in ${language}.
You MUST respond ONLY with a valid JSON object (no markdown formatting, no code blocks like \`\`\`json) matching exactly this schema:
{
  "title": "A catchy title for the video (in ${language})",
  "executiveSummary": ["bullet 1", "bullet 2", "bullet 3"],
  "keyHighlights": [
    { "timestamp": "MM:SS", "point": "Description of the key point" }
  ],
  "deepDive": "A detailed section-by-section breakdown of the core concepts discussed (2-3 paragraphs)",
  "actionables": ["action step 1", "tool 1", "action step 2"]
}`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the transcript:\n${trimmedTranscript}` }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    let text = completion.choices[0]?.message?.content || '{}';
    
    // Clean up potential markdown formatting from the response just in case
    text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    try {
      const summaryJson = JSON.parse(text);
      summaryJson.fullTranscript = trimmedTranscript; // Added transcript for Chat context
      return NextResponse.json(summaryJson);
    } catch (jsonErr) {
      console.error('Failed to parse JSON from AI:', text);
      return NextResponse.json({ error: 'AI returned malformed JSON' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
