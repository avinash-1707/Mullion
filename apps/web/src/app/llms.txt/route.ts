import { siteConfig } from "@/config/site";

// llms.txt (https://llmstxt.org): a markdown summary of the site for LLM
// crawlers. Marketing surface only, same scope as sitemap.ts; the signed-in
// product lives on the dashboard app and is not crawlable.
export const dynamic = "force-static";

export function GET(): Response {
  const body = `# ${siteConfig.name}

> ${siteConfig.description}

${siteConfig.name} is an interactive multi-agent build platform. You describe a project in plain language. Agents ask a short set of multiple-choice questions to pin down requirements, then plan the architecture live as an editable diagram and decision log. Once you confirm the plan, you either export the specs to build it yourself or let the agents build it. Finished work is delivered as an archive or pushed to GitHub.

Using the product requires an account and sign-in. Only the marketing pages listed below are public.

## Pages

- [Home](${siteConfig.url}/): what ${siteConfig.name} does and how the flow works, from idea to shipped project
- [Pricing](${siteConfig.url}/pricing): plans and pricing

## Optional

- [Sitemap](${siteConfig.url}/sitemap.xml)
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
