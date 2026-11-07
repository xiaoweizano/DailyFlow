## Getting Started {#quick-start}

DailyFlow is a local-first personal work memory system. Journals capture the process, tasks carry follow-up actions, and knowledge keeps conclusions that will be useful again.

### Start from the workbench

The workbench summarizes today's journal, due tasks, recent knowledge, and the last 12 weeks of activity.

1. Choose **Open today's journal**. A new empty journal starts with a template picker.
2. Choose **Blank journal** or a template. The document opens immediately after selection.
3. Use the `+` beside a block, or type Markdown such as `## Hello`.
4. Open **Tasks**, enter a title, and select a due date.
5. Open **Data** and create one full backup so the recovery flow is verified.

**Expected result:** Today's journal and tasks appear on the workbench, and the sidebar opens every work area.

**Recovery:** If the workbench looks stale, leave and reopen it. If a journal will not save, keep the window open and check the data directory and free disk space.

### Local data boundary

The desktop app stores data in a local database and attachment directory. DailyFlow does not include cloud sync. Create a full backup before reinstalling, moving devices, or clearing data.

## Create and Edit a Daily Journal {#journal}

Each date has one journal. The editor follows one flow: choose a template, write the body, use the outline, save, and promote reusable conclusions.

### Choose a template

When a new journal has no title or body, the document area starts with the template picker.

1. Review **Recent**, ordered by latest use and limited to four visible choices.
2. Choose **Blank journal** to start without a structure.
3. Choose a built-in daily report, weekly report, troubleshooting, or retrospective template.
4. Choose a custom template, or create one with a name, description, and initial Markdown.

**Expected result:** The document opens immediately and the recent-template order updates.

**Recovery:** If the picker is missing, the journal already has a title or body. Existing content is never replaced by the template screen.

### Insert content from the current block

Move over a block or put the keyboard cursor inside it to reveal a single `+`.

1. Choose `+` to open the current-block insert menu.
2. Insert a heading, list, task list, quote, code block, table, image, attachment, formula, or Mermaid diagram.
3. The new content appears after the current block.
4. Type `/` for the same menu, or use Markdown shortcuts directly.

**Expected result:** One current-block entry is visible, the body remains editable, and the menu does not cover the toolbar.

**Recovery:** If `+` is hidden, place the cursor in the body. Press `Esc` to close an open menu before targeting another block.

### Use Markdown and the outline

Type `## Hello` followed by a space in an empty paragraph to create a second-level heading. Type `##　Hello` with a full-width space for the same result.

1. Use `#` through `######` for heading levels.
2. Use `- ` for a list, `> ` for a quote, and three backticks for a code block.
3. Select an outline heading to jump to its body position.
4. On a narrow window, open the outline from the toolbar so it does not compress the body.

**Expected result:** The heading style and outline update together, and Markdown markers do not remain in the body.

**Recovery:** If a shortcut does not convert, confirm that the cursor is in an empty paragraph and remove leading spaces.

### Autosave and history

After typing stops, the title, body, tags, and structured content save together. The top save state reports saving, saved, or failed.

1. Press `Ctrl/Cmd + S` to save immediately.
2. Open **History** to inspect previous revisions.
3. Restoring an older version creates a new revision and preserves existing history.

**Expected result:** The save state settles, and reopening the same date shows the saved content.

**Recovery:** Do not close the window after a failed save. Keep the page open, copy the body or create a backup, then check permissions and free space.

### Promote a journal into knowledge

After the journal is saved, promote the whole journal without selecting a block, or select one structured block to promote only that block.

**Expected result:** The knowledge title, summary, plain text, Markdown, and source date match the journal content.

**Recovery:** If promotion fails, confirm the journal is saved and has a title. Keep the dialog and its input open while correcting the reported field.

## Use the Timeline {#timeline}

Use the timeline to revisit a day, month, or year without repeatedly pressing the previous-month button.

### Jump to a year and month

1. Choose the year button in the timeline header.
2. Enter any year from `1` through `9999`.
3. Use **This year**, **Last year**, or **Two years ago** for a quick jump.
4. Choose a month from the twelve-cell grid.

**Expected result:** The calendar, day timeline, and annual heatmap use the same picker and refresh immediately.

**Recovery:** If the year cannot be confirmed, enter only digits in the supported range. Press `Esc` to close the picker without changing the month.

### Read the green activity scale

The calendar and annual heatmap use a dedicated green activity scale that does not follow the interface accent color.

1. A darker cell means more journal activity on that date.
2. Today and the selected date use a border without changing the activity color.
3. A task due marker represents the due date, not the task creation date.

**Expected result:** Activity remains distinguishable in both light and dark themes.

**Recovery:** If a date has no activity color, confirm that its journal was saved, then reopen the timeline.

## Tasks: Create, Complete, and Reopen {#tasks}

Tasks hold follow-up actions. Investigation, decisions, and retrospectives belong in the journal.

### Create a task

1. Open **Tasks** and choose **New task**.
2. Enter a title and an optional note.
3. Choose a priority.
4. Select a due date with the date picker.
5. Choose **Create task**.

**Expected result:** The task appears in the active view with the title, date, and priority you entered.

**Recovery:** A failed creation keeps the dialog open. A title error appears beside the title, and a date error appears beside the date. Correct the field and submit again.

### Complete and reopen

Every task row keeps a visible text action.

1. An open task shows **Complete**.
2. A completed task shows **Reopen**.
3. Choose **Edit** to change a title, note, due date, or priority.

**Expected result:** The row and list refresh immediately. A failed action restores the previous state and reports an inline error.

**Recovery:** If the action does not change the task, refresh the view and reopen the task. If it continues to fail, record the error and check whether the local database is writable.

## Knowledge: Create and Track Sources {#knowledge}

Knowledge stores notes, issues, solutions, decisions, and references that remain useful across dates.

### Create knowledge

1. Open **Knowledge** and choose **New knowledge**.
2. Fill in the title, summary, and Markdown body in the enlarged editor.
3. Choose a knowledge type and review document information in the right panel.
4. The save button is disabled and shows progress while the request runs.

**Expected result:** A successful save opens the new knowledge detail. The dialog itself does not scroll; only the body editor scrolls.

**Recovery:** Validation errors keep all input and identify the field. For a storage failure, create a full backup, then check directory permissions and free space.

### Promote from a journal

1. Open a saved journal.
2. With no block selected, choose **Promote whole journal**.
3. With a structured block selected, choose **Promote current block**.
4. Review the title, summary, type, and body before saving.

**Expected result:** Knowledge is an independent snapshot. Later journal edits do not rewrite it, and its detail page can return to the original journal.

**Recovery:** If the source journal was deleted, the knowledge body remains readable and the page marks the source as unavailable.

## Search and Analytics {#search-analytics}

Search covers journals, knowledge, tasks, and structured blocks. Analytics shows work rhythm across weeks, months, and years.

### Search records

1. Choose the top search field or press `Ctrl/Cmd + K`.
2. Enter a title, body phrase, tag, or task name.
3. Switch among journal, knowledge, task, and block results.
4. Open a result to continue editing or return to its source.

**Expected result:** Results show context, and an empty query does not trigger a broad scan.

**Recovery:** If known content is missing, check the keyword and active result type. When the app reports a stale index, rebuild it from the Data page.

### Review analytics

1. Choose week, month, or year.
2. Review recorded days, characters, completed tasks, and knowledge activity.
3. Inspect trends, active tags, and the period report.
4. Leave the report draft in place until it saves, or use its explicit save action.

**Expected result:** Switching periods does not discard an unsaved report draft.

## Data, Backup, and Recovery {#data}

The Data page manages legacy TXT import, Markdown exchange, full backup, restore, and index maintenance.

### Create a full backup

1. Open **Data** and choose full backup.
2. Select a safe destination outside the app's primary data directory.
3. Wait for the task to finish and confirm the backup file and validation result.
4. Back up current data again before a restore.

**Expected result:** The backup contains the database, revision history, and attachments and can be restored offline.

**Recovery:** If backup fails, record the destination and error, then check space and permissions. Do not delete the existing data directory.

### Import and restore

1. Organize legacy TXT files by month, such as `202604` and `202605`.
2. Review parsed dates, duplicates, invalid files, and text encodings after scanning.
3. Use single-entry Markdown exchange for one journal.
4. A failed full restore does not replace existing data.

**Expected result:** An import commits completely or rolls back. Journals, tasks, and attachments open after restore.

**Recovery:** If search returns nothing after a restore, rebuild the full-text index from Data. Rebuilding does not modify journal bodies.

## Settings: Language, Appearance, and Close Behavior {#settings}

Settings stay on this device. Preview a change before saving values that must persist.

### Switch language

1. Open **Settings > General**.
2. Choose **简体中文** or **English**.
3. Check navigation, the workbench, journals, tasks, timeline, knowledge, search, analytics, and Help Center.
4. Confirm that dates, month names, empty states, and error messages also changed.

**Expected result:** The current window uses the new language immediately without a restart.

**Recovery:** If a page still shows the old language, note its title and controls, return to Settings, and confirm the language value saved.

### Adjust appearance

1. Open **Settings > Appearance**.
2. Choose Light, Dark, or Follow system.
3. Choose an accent swatch. The selected swatch shows both a check mark and border.
4. Choose Compact, Comfortable, or Spacious density.

**Expected result:** Options appear directly and wrap naturally. No native scrolling selector or inner scrollbar appears.

**Recovery:** If a control looks selected but the interface does not change, return to Settings and check for a save error. Restore **Follow system** if needed.

### Configure window close

1. Open **Settings > General > When closing the window**.
2. Choose **Ask every time**, **Always minimize**, or **Quit directly**.
3. The default is **Ask every time**, and **Minimize** is the primary dialog action.
4. Select **Remember my choice** in the dialog when the current choice should persist.

**Expected result:** The next window close follows the selected behavior. Explicit quit waits for unsaved journal data to finish saving.

## Troubleshooting {#troubleshooting}

Keep the current window and input, then use the field and location of the error to narrow the cause.

### A journal will not save

1. Read the top save state and error.
2. Confirm the data directory is writable and has free space.
3. Check whether the same date changed in another window.
4. After a conflict, copy the current body before reloading or restoring the newer revision.

### Task creation fails

Confirm that the title is not empty and the due date came from the date picker. Field errors return to the corresponding input while the other values remain in the dialog.

### Saving to knowledge fails

Confirm that the journal is saved and has a title. Use the specific error in the dialog to check fields, the data directory, and disk space rather than relying on a generic retry message.

### Search returns nothing

Check the keyword and result type. After a restore or stale-index message, rebuild the index from Data.

### Timeline data looks wrong

Confirm the entered year and selected month. A task marker is its due date, and today's border does not change the green activity level.
