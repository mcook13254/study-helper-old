# StudyHelper 1.8.0 — October 27, 2026

## Adaptive study

- Five-question practice rounds prioritize overdue reviews, unseen questions, lower mastery, and recent misses. Ties vary to avoid always choosing the same questions.
- Correct answers schedule reviews after 1, 2, 4, 8, 16, then at most 30 days. A missed question becomes due after 10 minutes. Rounds may still include a not-yet-due question when there are too few alternatives.
- Review attempts and mastery are scoped by course, study set, and question. Identically named concepts in separate courses no longer affect one another's course mastery.
- Existing global concept mastery remains as the legacy aggregate. Initial scoped values use it as a baseline; historical answers cannot reliably be attributed to individual sets retroactively.

## Performance and reliability

- Course summaries group questions in one pass instead of repeatedly flattening every set and searching for course assignments for every question and course.
- Course and set filtering happens before question normalization.
- Navigation-only saves no longer enqueue an identical cloud study-data upload. Local saves remain immediate.
- Question identifiers survive normalization and editing. Missing identifiers are assigned once and retained, preventing repeated cloud upserts from creating fresh question records.
- Game countdowns use elapsed wall-clock time so delayed background ticks do not extend games. Closing, replacing, or navigating away from a round cancels its timer and prevents late scoring.
- Answer shuffling uses Fisher–Yates instead of a random sort comparator.
- Zero mastery remains zero instead of falling back to 50. Daily study streaks use the browser's local date.
- Local save errors alert the user. Cloud sync errors show a retry control; saved browser data remains available for export.

## Preserved behavior and data

- Practice remains untimed. Quest Rush retains 60 seconds; Campus Clash retains 75 seconds; Boss Battle retains three lives without a countdown.
- Existing editors, TXT imports, multiple-answer grading, textbooks, library/sharing, profiles, and administration remain present.
- Local storage keys and IndexedDB textbook storage are unchanged. Original courses, questions, XP, streaks, legacy concepts, and backup fields are retained by the update.
- The new migration adds only `progress.adaptive` JSONB. No user rows are deleted, renamed, or reset. Old clients omitting this field do not clear existing adaptive history during sync.
- JSON backups include adaptive history automatically. As before, JSON backups do not embed textbook PDF files.

## Source selection

The supplied `studyhelper-v1.7.1-final.tar.gz` contains many nested historical projects rather than a single deployable root. Its `studyhelper/studyhelper-games-practice-fixed.js` was compared with the runnable `studyhelper-stable` project in `studyhelper-v1.7.1-practice-games-fixed.tar.gz`. The comparison project's app retains the game/practice implementation and adds safer question normalization plus missing admin request handlers. That coherent project supplies the deployment files for this release; the final archive was retained unchanged in the working workspace.

## Verification and limits

- 16 automated tests pass using Node's built-in test runner; all JavaScript files pass syntax checks.
- Tests cover review scheduling, scope isolation, legacy data preservation, stable IDs, actual answer callbacks, cancellation, game expiration after delayed ticks, cloud payloads, preserved course assignments, and local HTTP serving.
- Cloud tests use an authenticated Supabase mock. A production login, database migration, PDF upload, and multi-device sync were not exercised against a live Supabase project.
- Visual browser layout was not separately reviewed. No UI redesign was made.
- Existing cloud sync remains merge-only: deleting a local set does not delete its cloud rows. This release does not add destructive cloud deletion or resolve simultaneous multi-device editing conflicts.
- Spaced review changes question selection, not question wording. Existing Recall/Apply/Explain modes continue using authored question content. Campus Clash rivals remain simulated.
