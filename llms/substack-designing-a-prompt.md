# Designing a Prompt

- Source: https://legibility.substack.com/p/designing-a-prompt
- Published: 2026-01-12T20:57:16.431Z
- Retrieved: 2026-01-24

## Summary
Consider the prompt as a workspace presented to the AI.

## Full text
Consider the prompt as a workspace presented to the AI. When you sit down to write an essay, your workspace could be anything from a clean table and empty notebook to a scattering of books, magazines, papers, or whatever else you could think to maybe reference. It's flexible, but it's on you to figure out how you want it structured.

Some people, like power users, enjoy this. But most people don't, and this is obvious if you think about writing prose versus code.

You wrote an essay and want feedback before publishing, so you try ChatGPT. An empty input. You're not sure exactly what to say--maybe just paste the essay and its references in? It responds with a wall of text and a litany of suggestions. Reading it, you see it's getting lost and referring things completely wrong. You want it to focus one part of the essay, but the references contain important info. You scroll back up, copy and paste part of the essay, and receive, again, misguided advice. You start a new chat and see the blank screen before returning to your draft.

With ChatGPT, you need to be concerned with whether you're asking the question the right way. The wrong (or missing) framing gets you an answer that's too generic or hallucinated and suddenly the intelligence people seem so sold on doesn't really make itself apparent.

The problem with generic chat interfaces is that they're a blank screen with a text input. It's inviting you to say *something*, rather than prompting you, and so the user is burdened with wording in addition to whatever they were looking for help on. Instead, the leverage in designing an interface with AI is in how we design our prompts.

You can point to system prompts as the solution for this. It's easy to say "You are a senior software engineer with strict coding standards..." and put some filesystem tools in there, but this is too reductive of a prompt's power.

To show what I mean, imagine a friend who's been raving about how he uses AI to write code. He was already a professional, so you're curious why his experience is so much better than yours.

You two are at a coffee shop. You watch him writing code in an app called Cursor which has the code and AI alongside each other. He talks to it like they have history together, like they're in a call or in the same room, and the AI responds in kind. "Here's what we have, this is the industry standard, this is how I understand your request." His screen highlights code and proposes replacements. He hardly spends any time explaining *why*--he just says "I want this to happen" and it puts together its prompt from the environment and makes it happen.

In Cursor, your friend and the AI occupy the same space. They're looking at the same files together under the shared lens of "we are writing software." He gestures at things and points forward. He wields the AI to help him build his software.

The biggest difference between Cursor and ChatGPT is Cursor is actively defining the bounds of the AI. Behind the scenes, Cursor is telling the AI "Your world are these source code files. Your environment is the programming language contained therein. Your handles for interaction are your ability to run terminal commands, see outputs, and edit files." For ChatGPT, it just knows whatever we remember to tell it.

If you're building something with AI, you need to treat the AI as an inhabitant and your prompt as its world. Is its world internally coherent? How much of the outcome are you willing to gamble on an incoherent presentation?
