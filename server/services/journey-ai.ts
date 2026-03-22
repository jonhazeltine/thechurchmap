interface JourneyContext {
  churches: Array<{
    id: string;
    name: string;
    city?: string;
    state?: string;
    denomination?: string;
    description?: string;
    strengths?: string[];
    needs?: string[];
    prayer_requests?: string[];
    recent_prayers?: string[];
  }>;
  metrics: Array<{ metric_key: string; display_name: string; description?: string; category_id?: string }>;
  customSteps: Array<{ title: string | null; body: string | null }>;
  journeyTitle: string;
  journeyDescription: string | null;
}

interface AISuggestion {
  step_type: 'church' | 'community_need' | 'custom' | 'scripture' | 'thanksgiving';
  title: string;
  body: string;
  scripture_ref?: string;
  scripture_text?: string;
  church_id?: string;
  metric_key?: string;
}

export async function generateJourneySuggestions(context: JourneyContext): Promise<AISuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set, returning fallback suggestions');
    return generateFallbackSuggestions(context);
  }

  try {
    const prompt = buildPrompt(context);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a prayer guide assistant for The Church Map, a platform that helps communities pray for their churches and neighborhoods. Generate heartfelt, theologically sound prayer prompts and relevant scripture passages. Keep prayers concise (2-4 sentences) and scripture references accurate (include the full verse text). Return valid JSON only.`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, await response.text());
      return generateFallbackSuggestions(context);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return generateFallbackSuggestions(context);
    }

    const parsed = JSON.parse(content);
    return (parsed.suggestions || []) as AISuggestion[];
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    return generateFallbackSuggestions(context);
  }
}

function buildPrompt(context: JourneyContext): string {
  const parts = [`Generate prayer prompts and scripture suggestions for a prayer journey titled "${context.journeyTitle}".`];

  if (context.journeyDescription) {
    parts.push(`Journey description: ${context.journeyDescription}`);
  }

  if (context.churches.length > 0) {
    parts.push('\nChurches in this journey:');
    for (const c of context.churches) {
      let churchContext = `- ${c.name}`;
      if (c.city) churchContext += ` in ${c.city}, ${c.state}`;
      if (c.denomination) churchContext += ` (${c.denomination})`;
      if (c.description) churchContext += `\n  About: ${c.description.substring(0, 200)}`;
      if (c.strengths && c.strengths.length > 0) churchContext += `\n  Ministry strengths: ${c.strengths.join(', ')}`;
      if (c.needs && c.needs.length > 0) churchContext += `\n  Areas needing support: ${c.needs.join(', ')}`;
      if (c.prayer_requests && c.prayer_requests.length > 0) churchContext += `\n  Their prayer requests: ${c.prayer_requests.join('; ')}`;
      if (c.recent_prayers && c.recent_prayers.length > 0) churchContext += `\n  What others have prayed: ${c.recent_prayers.join('; ')}`;
      parts.push(churchContext);
    }
    parts.push('\nFor each church, write a unique prayer that reflects their specific context — their denomination, strengths, needs, and prayer requests. Don\'t use generic prayers. Reference their actual situation. Include a relevant scripture reference and full verse text that connects to their specific needs or calling.');
  }

  if (context.metrics.length > 0) {
    parts.push('\nCommunity needs identified in this area:');
    for (const m of context.metrics) {
      let needContext = `- ${m.display_name}`;
      if (m.description) needContext += `: ${m.description}`;
      parts.push(needContext);
    }
    parts.push('For each community need, write a compassionate prayer that names the specific struggle and asks God to bring tangible help. Include a scripture that speaks directly to this kind of need — not generic comfort verses.');
  }

  if (context.customSteps.length > 0) {
    parts.push('\nCustom prayer focuses added by the admin:');
    for (const s of context.customSteps) {
      parts.push(`- ${s.title || 'Untitled'}: ${s.body || ''}`);
    }
  }

  parts.push('\nAlso generate:');
  parts.push('1. 2-3 scripture slides with relevant Bible verses that connect to the journey themes');
  parts.push('2. A thanksgiving slide that gives thanks for the work being done and prayers being lifted, with a God-glorifying closing scripture');

  parts.push(`\nReturn JSON in this format:
{
  "suggestions": [
    {
      "step_type": "church" | "community_need" | "scripture" | "thanksgiving",
      "title": "short title",
      "body": "prayer prompt text (2-4 sentences)",
      "scripture_ref": "e.g. Jeremiah 29:7 (include for ALL step types)",
      "scripture_text": "full verse text (include for ALL step types)",
      "church_id": "church uuid if step_type is church",
      "metric_key": "metric key if step_type is community_need"
    }
  ]
}`);

  return parts.join('\n');
}

function generateFallbackSuggestions(context: JourneyContext): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  // Generate prompts for each church with scripture
  const churchScriptures = [
    { ref: 'Matthew 16:18', text: 'And I tell you, you are Peter, and on this rock I will build my church, and the gates of hell shall not prevail against it.' },
    { ref: 'Hebrews 10:24-25', text: 'And let us consider how to stir up one another to love and good works, not neglecting to meet together, as is the habit of some, but encouraging one another.' },
    { ref: 'Ephesians 4:11-12', text: 'And he gave the apostles, the prophets, the evangelists, the shepherds and teachers, to equip the saints for the work of ministry, for building up the body of Christ.' },
    { ref: 'Colossians 3:16', text: 'Let the word of Christ dwell in you richly, teaching and admonishing one another in all wisdom, singing psalms and hymns and spiritual songs, with thankfulness in your hearts to God.' },
    { ref: '1 Corinthians 12:27', text: 'Now you are the body of Christ and individually members of it.' },
  ];

  const churchPrayers = [
    (name: string, city: string) => `Lord, we lift up ${name}${city} to You. Strengthen their ministry, unite their congregation, and use them as a beacon of hope in their community.`,
    (name: string, city: string) => `Father, pour out Your Spirit on ${name}${city}. Give their leaders wisdom and their people courage to love their neighbors well.`,
    (name: string, city: string) => `God of all grace, bless ${name}${city}. May their doors be wide open to the weary, their hearts tender to the hurting, and their hands ready to serve.`,
    (name: string, city: string) => `Jesus, You are the head of the church. We pray for ${name}${city} — may they reflect Your love, pursue Your justice, and proclaim Your truth with boldness and humility.`,
    (name: string, city: string) => `Holy Spirit, breathe new life into ${name}${city}. Ignite a passion for prayer, deepen their fellowship, and empower them for mission in their neighborhood.`,
  ];

  for (let i = 0; i < context.churches.length; i++) {
    const church = context.churches[i];
    const scripture = churchScriptures[i % churchScriptures.length];
    const cityStr = church.city ? ` in ${church.city}` : '';
    const prayerTemplate = churchPrayers[i % churchPrayers.length];
    suggestions.push({
      step_type: 'church',
      title: `Pray for ${church.name}`,
      body: prayerTemplate(church.name, cityStr),
      church_id: church.id,
      scripture_ref: scripture.ref,
      scripture_text: scripture.text,
    });
  }

  // Generate prompts for community needs with scripture
  const needScriptures = [
    { ref: 'Isaiah 58:10', text: 'If you pour yourself out for the hungry and satisfy the desire of the afflicted, then shall your light rise in the darkness and your gloom be as the noonday.' },
    { ref: 'Psalm 34:17-18', text: 'When the righteous cry for help, the Lord hears and delivers them out of all their troubles. The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    { ref: 'Matthew 25:35-36', text: 'For I was hungry and you gave me food, I was thirsty and you gave me drink, I was a stranger and you welcomed me, I was naked and you clothed me, I was sick and you visited me, I was in prison and you came to me.' },
  ];

  for (let i = 0; i < context.metrics.length; i++) {
    const metric = context.metrics[i];
    const scripture = needScriptures[i % needScriptures.length];
    suggestions.push({
      step_type: 'community_need',
      title: `Pray for ${metric.display_name}`,
      body: `Father, we bring the need of ${metric.display_name.toLowerCase()} in this community before You. Provide resources, wisdom, and compassion to those working to address this need. Open doors for the churches in this area to serve and bring Your healing presence.`,
      metric_key: metric.metric_key,
      scripture_ref: scripture.ref,
      scripture_text: scripture.text,
    });
  }

  // Add default scripture
  suggestions.push({
    step_type: 'scripture',
    title: 'Seek the Welfare of the City',
    body: 'Let this verse guide our prayers for this community.',
    scripture_ref: 'Jeremiah 29:7',
    scripture_text: 'But seek the welfare of the city where I have sent you into exile, and pray to the Lord on its behalf, for in its welfare you will find your welfare.',
  });

  // Add thanksgiving
  suggestions.push({
    step_type: 'thanksgiving',
    title: 'A Prayer of Thanksgiving',
    body: 'Heavenly Father, we thank You for the churches and communities we have lifted up in prayer. Thank You for hearing our prayers and for the work You are already doing in these neighborhoods. We trust that You are faithful to complete the good work You have begun.',
    scripture_ref: 'Psalm 136:1',
    scripture_text: 'Give thanks to the Lord, for he is good, for his steadfast love endures forever.',
  });

  return suggestions;
}
