---
title: Accessibility statement
section: legal
order: 10
summary: How accessible Curahold is: the standard we aim for (WCAG 2.2 AA), how we check it, what works, what does not yet, and how to tell us about a problem.
---
# Accessibility statement

Curahold should work for everyone who uses it: with a keyboard alone, with a screen reader, zoomed in, with high contrast or reduced motion, on a phone and in a right-to-left language. This statement covers the product (the app, the customer portal, the onboarding hub and the platform console with its Office), the website, the documentation and the demo.

## The standard

We aim for the **Web Content Accessibility Guidelines (WCAG) 2.2, level AA**. Today Curahold **partially conforms**: most of it meets level AA, and the gaps we know of are listed below. "Partially" also means people with disabilities have not yet tested it with us, which we want to change.

## How we check

- **On every release**, an automated check (axe-core, in a real browser) walks the main screens of every surface — filled, empty, with an error on a form and with a dialog open — in English, Turkish and Arabic, in the light and dark themes, at a desktop and a phone width. The release stops if it finds a serious or critical problem.
- The same check walks the keyboard: the first stop is "Skip to content", every stop shows where the focus is, dialogs keep the focus inside and give it back when they close, and nothing traps it.
- By hand, for each larger change: the keyboard path through signing in, adding a task, a customer, a support request, an onboarding step, the setup test and approvals; names and roles a screen reader announces; colour contrast of text, charts, badges and status dots in both themes; 200% zoom, a 320-pixel-wide window and wider text spacing; reduced motion; touch targets; and mirroring in right-to-left languages.

## What works

- **Keyboard**: every action can be done without a mouse, including moving cards on a board (Space to pick up, the arrow keys to move, Space to drop, Escape to cancel) and the keyboard shortcuts (press `?` to see them all). Every page starts with a "Skip to content" link.
- **Screen readers**: controls, fields and icons have names; pages have landmarks and headings; messages that appear by themselves (a saved change, a failed request, a form error) are announced; charts come with a text table of their numbers.
- **Seeing**: text and controls meet the AA contrast ratios in the light and the dark theme; a status comes with a word or an icon, not only a colour; the layout works at 200% zoom and at 320 pixels wide without sideways scrolling.
- **Motion**: with "reduce motion" switched on in your system, animations and counting-up numbers stop, and the 3D Office stays still: the camera cuts instead of gliding.
- **Language**: each page says its language, so a screen reader reads it with the right voice; Arabic, Hebrew and Persian are laid out right to left.
- **The 3D Office**: everything on the 3D floor is also available as text — the list of rooms and seats beside it, and a 2D floor plan you can switch to at any time.

## Known gaps

- The 3D view itself cannot be explored with the keyboard or a screen reader; use the list beside it or the 2D plan, which hold the same information.
- In the platform console's request lists and on the Office's name tags, a request's or a seat's state is shown as a coloured dot. Screen readers hear the state; on the screen the Office's legend names each colour, and the state is written out once the request or seat is opened.
- Text typed by your colleagues or customers (a task title, a comment, a file) is shown as they wrote it; we cannot add descriptions to pictures they upload.
- Some pages show content from a connected tool (for example an email body). We show it as the tool sends it and cannot guarantee its accessibility.

## Tell us

If something is hard or impossible to use, please tell us — it is a bug, and we treat it as one.

- **Signed in**: open **Help** in the menu and choose **Write to support**. Say "accessibility" in the subject so it reaches the right person.
- **Without an account**: write to **[accessibility contact address]**.

Tell us the page, what you tried to do and which browser and assistive technology you use. We answer within five working days, and when something cannot be fixed quickly we tell you a way around it.

This statement was last reviewed on 20 November 2026.
