import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

async function updateEpisodeStatus(episodeId: string, status: string) {
  await supabase
    .from("episodes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", episodeId);
}

const PLATFORM_LIMITS: Record<string, number> = {
  youtube_shorts: 180,
  instagram_reels: 180,
  tiktok: 600,
  x: 140,
  linkedin: 140,
};

function getPlatformFit(durationSeconds: number): string[] {
  return Object.entries(PLATFORM_LIMITS)
    .filter(([, limit]) => durationSeconds <= limit)
    .map(([platform]) => platform);
}

export async function POST(request: NextRequest) {
  try {
    const { episodeId } = await request.json();

    if (!episodeId) {
      return NextResponse.json({ error: "episodeId is required" }, { status: 400 });
    }

    const { data: episode, error: fetchError } = await supabase
      .from("episodes")
      .select("*")
      .eq("id", episodeId)
      .single();

    if (fetchError || !episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    if (!episode.transcript) {
      return NextResponse.json({ error: "Episode has no transcript — run transcription first" }, { status: 400 });
    }

    await updateEpisodeStatus(episodeId, "analyzing");

    const systemPrompt = `You are the content intelligence engine for TNBT (The Next Big Thing with Keith D. Terry).

TNBT is a worldview-driven Society and Culture media platform. Keith D. Terry is a culturally confrontational, intellectually serious, faith-informed voice covering AI and the future, masculinity, race, economics, leadership, institutional distrust, grief, reinvention, power, identity, and societal transformation. Content must be bold, direct, and culturally specific. Never sanitize, soften, or genericize Keith's voice. Write as if Keith himself wrote it.

You receive a podcast transcript with timestamps. Your job is to identify the most powerful, shareable clip moments and generate all platform content.

CLIP IDENTIFICATION RULES:
- Find natural beginning and end points — never cut mid-thought
- Score each clip 0-10 on virality, controversy, and emotional impact
- Content types: declaration, argument, story, teaching, debate
- Platform limits: YouTube Shorts 180s, Instagram Reels 180s, TikTok 600s, X 140s, LinkedIn 140s

OUTPUT FORMAT: You must respond with valid JSON only. No preamble, no explanation, no markdown code blocks. Pure JSON.`;

    const userPrompt = `Analyze this podcast transcript and return a JSON object with this exact structure:

{
  "clips": [
    {
      "start_time": 0.0,
      "end_time": 0.0,
      "duration_seconds": 0,
      "content_type": "declaration|argument|story|teaching|debate",
      "hook": "The exact opening line or paraphrase that grabs attention",
      "caption": "2-3 sentence description of why this clip is powerful and who it will reach",
      "virality_score": 0.0,
      "controversy_score": 0.0,
      "emotional_score": 0.0,
      "platform_fit": ["youtube_shorts", "instagram_reels", "tiktok", "x", "linkedin"]
    }
  ],
  "youtube_titles": {
    "search_title": "SEO and keyword-driven title",
    "curiosity_title": "Pattern interrupt and open loop title",
    "bold_statement_title": "Keith's voice forward — culturally confrontational"
  },
  "episode_summary": "2-3 sentence editorial summary of the episode in Keith's voice",
  "positioning_statement": "One bold sentence that captures the episode central argument",
  "key_themes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
  "seo_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"],
  "controversy_score": 0.0,
  "emotional_score": 0.0,
  "audience_fit": "Description of who this episode reaches and why",
  "recommended_angle": "Editorial recommendation for how to position this episode on social",
  "platform_descriptions": {
    "youtube": "Full YouTube description with timestamps and CTAs",
    "linkedin": "Professional LinkedIn post in Keith voice — 150-200 words",
    "x": "X post under 280 characters — punchy and confrontational",
    "instagram": "Instagram caption with hook, body, and hashtags"
  }
}

Find 5-8 clips minimum. Prioritize high virality and controversy scores. The transcript uses [MM:SS] timestamp format — convert to decimal seconds for start_time and end_time (e.g. [4:12] = 252.0 seconds).

TRANSCRIPT:
Episode Title: ${episode.title}
Episode Type: ${episode.episode_type}
Guest: ${episode.guest_name || "Solo episode"}
Topic Category: ${episode.topic_category}
Duration: ${Math.floor((episode.duration_seconds || 0) / 60)} minutes

---
${episode.transcript_timestamped || episode.transcript}
---`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const responseText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("");

    let analysis;
    try {
      const cleanJson = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      analysis = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse Claude response:", parseError);
      await updateEpisodeStatus(episodeId, "analyzed");
      return NextResponse.json({ error: "Claude returned invalid JSON — check logs" }, { status: 500 });
    }

    const clips = analysis.clips || [];
    const clipsToInsert = clips.map((clip: {
      start_time: number;
      end_time: number;
      hook: string;
      caption: string;
      virality_score: number;
      controversy_score: number;
      emotional_score: number;
    }) => ({
      episode_id: episodeId,
      start_time: clip.start_time,
      end_time: clip.end_time,
      hook: clip.hook,
      caption: clip.caption,
      platform: "all",
      virality_score: Math.min(10, Math.max(0, clip.virality_score)),
      controversy_score: Math.min(10, Math.max(0, clip.controversy_score)),
      emotional_score: Math.min(10, Math.max(0, clip.emotional_score)),
      status: "pending",
    }));

    const { error: clipsError } = await supabase.from("clips").insert(clipsToInsert);
    if (clipsError) console.error("Failed to insert clips:", clipsError);

    const { error: analysisError } = await supabase.from("episode_analysis").insert({
      episode_id: episodeId,
      summary: analysis.episode_summary,
      positioning_statement: analysis.positioning_statement,
      key_themes: analysis.key_themes,
      controversy_score: analysis.controversy_score,
      emotional_score: analysis.emotional_score,
      audience_fit: analysis.audience_fit,
      seo_keywords: analysis.seo_keywords,
      recommended_angle: analysis.recommended_angle,
    });
    if (analysisError) console.error("Failed to insert episode analysis:", analysisError);

    const youtubeTitles = analysis.youtube_titles || {};
    const platformDescriptions = analysis.platform_descriptions || {};

    const { error: metadataError } = await supabase.from("metadata_assets").insert([
      { episode_id: episodeId, platform: "youtube", title: youtubeTitles.search_title || "", description: platformDescriptions.youtube || "", hashtags: analysis.seo_keywords || [], status: "draft" },
      { episode_id: episodeId, platform: "linkedin", title: youtubeTitles.bold_statement_title || "", description: platformDescriptions.linkedin || "", hashtags: analysis.seo_keywords || [], status: "draft" },
      { episode_id: episodeId, platform: "x", title: youtubeTitles.curiosity_title || "", description: platformDescriptions.x || "", hashtags: analysis.seo_keywords || [], status: "draft" },
      { episode_id: episodeId, platform: "instagram", title: youtubeTitles.bold_statement_title || "", description: platformDescriptions.instagram || "", hashtags: analysis.seo_keywords || [], status: "draft" },
    ]);
    if (metadataError) console.error("Failed to insert metadata assets:", metadataError);

    await supabase.from("episodes").update({ status: "analyzed", updated_at: new Date().toISOString() }).eq("id", episodeId);

    return NextResponse.json({
      success: true,
      episodeId,
      clipsFound: clipsToInsert.length,
      youtubeTitle: youtubeTitles.search_title,
      summary: analysis.episode_summary,
      message: `Analysis complete — ${clipsToInsert.length} clips identified`,
    });

  } catch (error) {
    console.error("Analysis route error:", error);
    return NextResponse.json({ error: "Internal server error during analysis" }, { status: 500 });
  }
}

export const maxDuration = 300;
