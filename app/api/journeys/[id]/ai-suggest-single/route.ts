import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

// POST /api/journeys/:id/ai-suggest-single
// Generates a single prayer/scripture suggestion for one step
export async function POST(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { step_type, title, church_name } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user } } = await adminClient.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      // Fallback: generate a simple suggestion without AI
      const name = church_name || title?.replace("Pray for ", "") || "this community";
      const fallbacks = [
        { body: `Lord, we lift up ${name} in prayer. Strengthen their ministry, unite their congregation, and use them to be a light in this community.`, scripture_ref: "Philippians 1:9-10", scripture_text: "And this is my prayer: that your love may abound more and more in knowledge and depth of insight, so that you may be able to discern what is best." },
        { body: `Father, pour out Your Spirit on ${name}. Give them wisdom, courage, and compassion as they serve their neighbors and share Your love.`, scripture_ref: "Isaiah 40:31", scripture_text: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint." },
        { body: `God of all comfort, be with ${name}. May they be a place of refuge, healing, and hope for everyone who walks through their doors.`, scripture_ref: "Psalm 46:1", scripture_text: "God is our refuge and strength, an ever-present help in trouble." },
        { body: `Jesus, build Your church through ${name}. Let their worship bring glory to Your name and their service bring transformation to this neighborhood.`, scripture_ref: "Matthew 16:18", scripture_text: "And I tell you that you are Peter, and on this rock I will build my church, and the gates of Hades will not overcome it." },
        { body: `Holy Spirit, move in and through ${name}. Break down barriers, heal divisions, and ignite a passion for prayer and community care.`, scripture_ref: "Acts 2:42", scripture_text: "They devoted themselves to the apostles' teaching and to fellowship, to the breaking of bread and to prayer." },
      ];
      const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      return res.json(pick);
    }

    // Use OpenAI for a targeted single suggestion
    const prompt = step_type === 'church'
      ? `Generate a heartfelt prayer prompt (2-3 sentences) and one relevant scripture reference for praying for "${church_name || title}". Return JSON with fields: body, scripture_ref, scripture_text.`
      : `Generate a heartfelt prayer prompt (2-3 sentences) and one relevant scripture reference for the community need "${title}". Return JSON with fields: body, scripture_ref, scripture_text.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a prayer guide. Generate concise, theologically sound prayers with accurate scripture. Return valid JSON only with fields: body, scripture_ref, scripture_text.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'AI generation failed' });
    }

    const data = await response.json();
    const suggestion = JSON.parse(data.choices[0].message.content);
    return res.json(suggestion);
  } catch (error) {
    console.error('AI suggest single error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
