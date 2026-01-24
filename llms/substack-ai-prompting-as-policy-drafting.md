# AI Prompting as Policy Drafting

- Source: https://legibility.substack.com/p/ai-prompting-as-policy-drafting
- Published: 2026-01-20T06:30:41.575Z
- Retrieved: 2026-01-24

## Summary
A phrase you'll often hear in online tech circles is "The cost of software is going to zero." This raises an obvious question: what happens to skill premiums if the current is rapidly devaluing?

## Full text
A phrase you'll often hear in online tech circles is "The cost of software is going to zero." This raises an obvious question: what happens to skill premiums if the current is rapidly devaluing? I believe the premium is shifting from technical reasoning to policy drafting.

Programming with agents is becoming big business. Cursor, the largest tool for doing so, has passed a $1B ARR and $29.3B post-money valuation. If you're anywhere near tech twitter, you'll hear memes and anecdotes of how dependent people--both developers *and* product owners--are becoming on tools like Claude Code or Codex. The AI providers themselves, Anthropic and OpenAI, are developing their tools primarily through their own agents. If it's getting so easy to pump out code, it's reasonable to consider prompting over writing code manually one of the primary futures the profession will follow.

So why policy? Think about our current approach to dealing with agents. A litany of markdown files and context management harnesses that govern what the model is allowed to see and how it's allowed to act. The agent interprets what it sees and acts accordingly. In just a hundred or so words of English, we can have an entire functioning app (often hundreds or thousands of lines of code) ready for our use. Underscoring this is the fact that we're using structured, clarified English to bound an otherwise independent entity in a system where its actions have effects beyond the immediate files it touches.

And think about our current approach to governance within any organization. A litany of documents detailing what we are and are not allowed to do. We, as members of the organization, interpret these as the bounds of what we can do without reprisal from external associations. In a few hundred or thousand words, organizations define jurisdictions under which its members can freely act and advance their causes. Underscoring all of this is the fact that we're using structured English to bound otherwise independent human beings in an organization where their actions can ripple beyond their immediate teams.

In practice, many senior engineers already do this. Architectural documentation, team expectations, company standards. Junior engineers largely study these, implement systems against them, and keep bumping into them until they gain a large enough handle to wield them themselves.

But the surface area that these policies need to cover is exploding. With Cursor, it takes a junior, at most, a few days to implement and validate new feature. The junior is no longer constrained by the grind remembering syntax, refactoring according to style standards, or decomposing difficult technical problems. In many cases he need only ask "can you implement this according to this spec?" The old policies had their weaknesses uncovered after weeks of development; now, it just takes a feature spec, a few days, and maybe a few questions.

Two things happen with this new speed.

First, as mentioned, much more code in much less time. The policies need to be strict to keep things in line. Terminology needs to be tight and consistent, otherwise the same word could mean 4 different things in the same system at which point, what is the agent supposed to think? Documentation needs to be comprehensive and specific. While the code itself is the best descriptor of the system, the agents are starting from a blank slate. They're not primed with the thousands of hours of discussion and work on the problems that translate to these systems. Documentation fills this gap as a primer for its mental model and a table of contents for what terms to look around for.

Second, the iteration speed increases. Friction has been reduced, so we need to policies that dictate where friction needs to be in order to keep things stable. Otherwise, you end up with a runaway effect of teams pushing partially understood features on top of other partially understood features. Suddenly, you get production issues no one can figure out how to easily solve because the collective mental models couldn't even conceive of such a bug existing. These are traditionally career defining skills, but are becoming much more important to nail down early lest the junior engineers break prod in ways no one can predict.

So, as an engineer, what am I to do about this? I have no idea. I suspect that billions will be made by those who can figure this out early and operationalize this, but I don't expect larger corporations to get going on this anytime soon. But seeing as we have thousands of years of governing each other behind us, I imagine there's something to learn from those more steeped in historical contexts.
