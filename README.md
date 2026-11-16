# Household Ledger

A personal finance dashboard that runs in your web browser. It has five pages:

- **Balance sheet**: what you own, what you owe, and your net worth over time
- **Budget & spending**: a monthly plan by category, plus a transaction log
- **Debt manager**: payoff dates and interest using the avalanche or snowball method
- **Investments**: account values, gains, contributions, and a 20-year projection
- **Retirement planner**: a projection of your retirement savings against a target

At the end of each month, the **Close month** button rolls your numbers forward (details below).

---

## Your data stays private

The code in this repository is public, but **your numbers are not stored in it.** Everything you type is saved in your own browser (using a feature called localStorage). Nobody who visits your site can see your data, and it never gets uploaded to GitHub.

Two things follow from that:

1. **Each browser keeps its own copy.** Numbers you enter on your laptop won't appear on your phone. To move them, use *Your data → Download backup* on one device and *Restore from backup* on the other.
2. **Clearing your browser's history or site data erases your numbers.** Download a backup at least once a month and keep it somewhere safe (it's a small `.json` file).

Never type passwords, account numbers, or Social Security numbers into the dashboard or into these files.

---

## Part 1: Put the site on GitHub (one-time setup, about 15 minutes)

GitHub stores your code. **GitHub Pages** is a free GitHub feature that turns that code into a website.

### 1. Create a GitHub account
Go to [github.com](https://github.com) and sign up. Your username becomes part of your site's address, so choose one you're happy with.

### 2. Create a repository
A *repository* ("repo") is a project folder on GitHub.

1. Click the **+** in the top-right corner, then **New repository**.
2. **Repository name:** `finance-dashboard` (or any name without spaces).
3. Choose **Public**. Free GitHub accounts can only publish Pages sites from public repositories. That's fine, since your financial data isn't stored in the code.
4. Leave the other options alone and click **Create repository**.

### 3. Upload the four files
1. On the new repository's page, click the link that says **uploading an existing file**. (If you don't see it, click **Add file → Upload files**.)
2. Drag in all four files: `index.html`, `styles.css`, `app.js`, `README.md`.
   They must sit at the top level of the repo, not inside a folder.
3. Under **Commit changes**, type a short note such as `Add dashboard files`.
4. Click **Commit changes**.

A *commit* is a saved snapshot of your files. GitHub keeps every one, so you can always see or restore earlier versions.

### 4. Turn on GitHub Pages
1. In your repository, click **Settings** (the gear tab along the top).
2. In the left menu, click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose **main** and **/ (root)**, then click **Save**.
5. Wait one to three minutes, then refresh the Settings → Pages screen. A box will show your site's address, which looks like:

   `https://YOUR-USERNAME.github.io/finance-dashboard/`

Bookmark that address. That's your dashboard.

---

## Part 2: Changing the code later

Every time you commit a change, GitHub Pages rebuilds your site automatically, usually within two minutes.

**To edit a file in your browser:**
1. Open the repository and click the file (for example, `app.js`).
2. Click the **pencil icon** (Edit this file).
3. Make your change, click **Commit changes…**, write a short note, and confirm.

**To replace a file with a new version:** click **Add file → Upload files**, drag in the new file with the same name, and commit. GitHub replaces the old one.

**To see your change:** open your site and do a hard refresh (Ctrl + Shift + R on Windows, Cmd + Shift + R on Mac) so your browser doesn't show an old copy.

**To check that a deployment finished:** click the **Actions** tab in your repository. A green check means the site updated; a red X means something went wrong (click it to read why).

**To undo a mistake:** open the file, click **History**, find the earlier version, and copy its contents back in.

Your saved numbers survive code updates as long as the site address doesn't change.

### Optional: GitHub Desktop
If you'd rather edit files on your computer, install [GitHub Desktop](https://desktop.github.com). Use **File → Clone repository** to download the repo, edit the files in any text editor, then click **Commit to main** and **Push origin** in GitHub Desktop to publish.

---

## Part 3: Using the dashboard each month

**First time:** the dashboard opens with sample numbers so you can see how it works. Click **Start with a blank ledger** when you're ready to enter your own, or **Keep and edit** to type over the samples.

**During the month:** log transactions on the Budget & spending page as they happen (or in one sitting each week).

**At the end of the month:**
1. Finish logging the month's transactions.
2. Update real balances from your statements: bank accounts on the Balance sheet, account values on Investments, and loan balances on the Debt manager.
3. Click **Close [month]** in the sidebar. You'll be asked which updates to apply:
   - **Apply debt payments** – adds a month of interest to each debt, pays each minimum, and sends your extra payment to the debt your plan targets (highest rate for avalanche, smallest balance for snowball).
   - **Add investment contributions** – adds each account's monthly contribution to its value and to the amount you've put in.
   - **Add estimated investment growth** – grows each account by its expected yearly return ÷ 12. Leave this off if you already typed in real balances in step 2.
   - **Move net cash flow into an account** – adds the month's income minus spending to the account you pick (usually checking).
4. The month's totals are saved to *Monthly snapshots* on the Balance sheet, and the ledger moves to the next month.
5. Click **Your data → Download backup**.

Closed the month too early? Use **Your data → Undo last month close** (works for the most recent close only).

> Tip: if you update balances by hand from statements in step 2, uncheck the debt-payment and growth options in step 3 so the payments aren't counted twice.

---

## Where things live in the code

| File | What it does |
|---|---|
| `index.html` | The page skeleton: sidebar, tabs, and where each page is drawn |
| `styles.css` | Colors, fonts, layout, and the light/dark themes |
| `app.js` | All the logic. Section 4, "Monthly close," has the month-end code; section 3 has the payoff, projection, and retirement math |

Charts use [Chart.js](https://www.chartjs.org) loaded from a CDN, so the charts need an internet connection. Everything else works offline once the page has loaded.

---

## Troubleshooting

- **404 page at my site address:** wait a few minutes after turning on Pages, confirm the file is named exactly `index.html` (lowercase), and confirm it's at the top level of the repo.
- **Site looks unstyled:** `styles.css` is missing or misnamed. File names are case-sensitive.
- **My numbers disappeared:** you may be in a private/incognito window, a different browser, or a different site address. Restore from your latest backup.
- **Charts don't show:** check your internet connection; the chart library loads from the web.

*This dashboard is a planning tool, not financial advice. Projections assume steady returns that real markets don't deliver.*
