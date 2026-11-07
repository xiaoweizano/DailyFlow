## Quick Start {#quick-start}

DailyFlow is a local-first personal work memory system. It combines daily journals, tasks, search, reusable knowledge, a timeline, and periodic reviews. Data stays on the current device by default.

### First Run

1. Open **Daily Journal** and choose today or another date.
2. A blank, unsaved journal opens with a template picker. Choose a blank journal, a recent template, or a built-in template.
3. Click `+` beside the body or type `/` to insert headings, lists, images, tables, formulas, and structured content.
4. Open **Tasks**, enter a title, and select a due date with the date picker.
5. Open **Data** and create a full backup so the local storage and recovery flow are verified.

### Recommended Rhythm

- Capture facts, decisions, and troubleshooting while the work is happening.
- Put follow-up actions in Tasks instead of mixing a checklist into journal prose.
- At the end of the day, turn reusable conclusions into knowledge.
- Review the timeline and analytics weekly, and create a full backup monthly.

### Data Boundary

Desktop uses a local SQLite database and attachment directory. The web build uses browser-managed storage. DailyFlow does not include cloud sync, so export or create a full backup before moving or reinstalling the app.

## Journals and Templates {#journal}

Each date has one journal. Use the date navigation to move one day at a time, select a date directly, or return to today.

### Choosing a Template

When a new journal is unsaved and both title and body are empty, the editor opens the template picker:

- Blank journal: start directly without a structure.
- Recent: templates ordered by their latest use.
- Built-in: daily report, weekly report, troubleshooting, and retrospective.
- Custom: enter a name, description, and initial Markdown body.

Custom templates are stored as local browser preferences. They are not written into journals, the database, or full backups. Keep any template that must travel with your data in a journal or separate document.

### Editing the Body

- Click `+` beside the body to open the insert menu at the current cursor.
- Type `/` to open the same insert menu.
- Markdown shortcuts create headings, lists, quotes, and code blocks. For example, `## Heading` creates an H2 that also appears in the outline.
- The toolbar provides undo, redo, headings, emphasis, lists, quotes, code, and attachments.
- Images, tables, formulas, Mermaid diagrams, and structured blocks are available from the insert menu.

### Autosave and History

Title, body, tags, and structured content are saved together after typing stops. Open **History** to inspect or restore a version. A restore creates a new revision instead of overwriting the stored history.

### Promoting Knowledge

Select a structured block to promote only that block, or promote the whole journal without a selection. A knowledge item is an independent snapshot; later journal edits do not rewrite content that was already promoted.

## Workbench and Timeline {#timeline}

The workbench summarizes today's journal, today's tasks, recent entries, knowledge entry points, and the last 12 weeks of activity. Activity always uses a green scale and does not follow the interface accent color.

The timeline has three views:

- Calendar: journals and due tasks by date.
- Timeline: daily titles, excerpts, and task counts.
- Annual heatmap: activity for the full year with due-task corner markers.

The calendar header provides year and month selectors, so you can jump directly to last year or an earlier year instead of stepping backward month by month. **Back to today** returns to the current month. The annual heatmap also has a year selector.

## Tasks {#tasks}

Tasks hold actionable follow-up items and their status. Detailed investigation, conclusions, and retrospectives belong in the daily journal.

### Creating a Task

1. Open **Tasks** and choose **New task**.
2. Enter a title and an optional note.
3. Choose a priority.
4. Select the due date with the date picker.
5. Choose **Create task**.

Use the date picker so the app receives a valid date. If creation fails, the dialog stays open with your input so you can correct the title or date and retry.

### Updating and Completing

Tasks can be completed, reopened, retitled, annotated, reprioritized, and rescheduled. The detail panel can link a task to its source journal. Completed items remain available in the Completed view.

### Views and Due Markers

Today, Upcoming, All, and Completed show different task states. Calendar and annual heatmap cells mark dates with due tasks, while the workbench lists tasks that need attention today.

## Knowledge Base {#knowledge}

Knowledge stores notes, issues, solutions, decisions, and references that remain useful across dates.

### Three Ways to Create Knowledge

- Create manually with a title, summary, and Markdown body.
- Promote a whole journal from the journal editor.
- Select a structured block and promote only that block.

Promotion copies the source into an independent snapshot. The knowledge body can be maintained later without being changed by journal edits.

### Source Tracking

Knowledge detail shows the source journal date and block. **Original journal** opens the source. If the source was deleted or is inaccessible, the page reports that the source is unavailable while keeping the knowledge body readable.

### Recommended Flow

1. Record symptoms, decisions, investigation, and the final solution in the journal.
2. Turn reusable conclusions into a structured block.
3. Choose the issue, solution, decision, note, or reference type and write a clear title.
4. Reuse it through the knowledge base, search, or analytics.

## Search and Analytics {#search-analytics}

Global search covers journals, knowledge, tasks, and structured blocks. Use the top search field, the search page, or the `/` and `Ctrl/Cmd + K` shortcuts.

If the index is stale, the search page offers a rebuild action. Rebuilding changes only the local full-text index, not journal content.

Analytics provides week, month, and year periods with recorded days, characters, completed tasks, knowledge activity, trends, active tags, and periodic reports. Switching periods keeps unsaved report drafts. Reports remain local and can be reopened for editing.

## Data, Backup, and Recovery {#data}

Data management covers legacy TXT import, Markdown import and export, full backup, restore, index maintenance, and storage location.

### Legacy TXT Import

1. Prepare a directory organized by month, such as `202604` and `202605`.
2. Select the root directory and scan it.
3. Review parsed dates, duplicates, invalid files, and text encodings.
4. Confirm the duplicate policy and import.

UTF-8, UTF-8 BOM, and GBK are supported. A failed import transaction rolls back database changes for that batch while preserving the source text.

### Markdown and Full Backup

- Single-entry import and export are for exchanging one journal.
- A full backup contains the database, history, and attachments and is the preferred recovery artifact.
- Create a backup of current data before a restore. If restore fails, existing data is not replaced.
- Custom journal templates are intentionally excluded from full backups because they are local preferences.

### After Restore

Search may be marked for rebuild after restore. Check the workbench, journals, and tasks first, then rebuild the index from the data page.

## Settings, Language, and Appearance {#settings}

Settings stay on the current device. General controls language, startup, and interface feedback. Appearance controls theme, accent, and density. Editor controls font size, width, outline, autosave interval, and the first day of the week.

Changing language previews immediately across navigation, workbench, journals, timeline, tasks, knowledge, search, analytics, and this manual. Choose **Save settings** to persist it.

The small appearance option sets wrap onto multiple rows instead of creating a horizontal scrollbar or up/down arrows. Activity heatmaps use a dedicated green semantic color and do not change with the accent color.

Desktop also supports launch at login, silent startup, close to tray, and a custom data directory. The web build follows the browser tab lifecycle and does not expose startup or tray options.

## Shortcuts and Troubleshooting {#troubleshooting}

### Common Shortcuts

- `/` or `Ctrl/Cmd + K`: global search.
- `Ctrl/Cmd + S`: save the current journal immediately.
- `Ctrl/Cmd + ,`: open settings.
- Settings > About > Shortcuts: view the complete set for the current platform.

### A Journal Will Not Save

Check that the data directory is writable and has free space, and verify that the journal was not updated in another window. After a conflict, reload or restore the newer version before saving again.

### Task Creation Fails

Confirm the title is not empty and the due date came from the date picker. The dialog keeps your input, so correct the value and retry without retyping everything.

### Saving to Knowledge Fails

Confirm the journal is saved and has a title. Network state does not affect local promotion. If the error continues, create a full backup, then check directory permissions and free disk space.

### Search Returns Nothing

Check spelling, switch to the relevant view, and inspect index state in Data. Rebuild the index after stale data or a restore.

### Timeline Data Looks Wrong

Check the selected year and month, then use the selectors to jump directly. Task markers represent due dates, not the date a task was created.
