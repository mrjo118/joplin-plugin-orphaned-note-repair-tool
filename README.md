# Orphaned note and conflict repair tool

A Joplin desktop and mobile plugin that finds notes and notebooks whose `parent_id` refers to a notebook that no longer exists. The scan includes notes in Joplin's virtual Conflicts notebook.

After a completed scan, the **Move deleted note conflicts to original notebooks** action can clear the conflict status of every conflict without a populated `conflict_original_id`. The action is shown whenever at least one such conflict was scanned. It asks for confirmation and moves nothing unless every direct parent notebook exists, listing any notebook IDs that must still be created.

On desktop, open **Tools → Orphaned note and conflict repair tool**. On mobile, open the plugin panels button and select **Orphaned note and conflict repair tool**. Then select **Scan for orphaned notes and notebooks**. Results appear while the paginated scan runs and show only the missing notebook ID plus the number of referencing notes and notebooks. You can stop a scan without losing its results.

Selecting **Recreate notebook** creates a root notebook with the original missing ID. Its title is `Recovered Notebook`, or `Recovered Notebook (2)`, `Recovered Notebook (3)`, and so on when needed to keep the title unique. If the notebook was originally inside a notebook hierarchy, you will need to manually move it back to the correct place, because the parent_id of the notebook cannot be recovered.

## Moving conflicts back to their notebooks

After a completed scan, the plugin may offer a Move deleted note conflicts to original notebooks action. This action appears only when the scan finds conflicts whose original notes were deleted, so it is normal not to see it after every scan. It can recover many eligible conflicts at once, returning them to notebooks throughout your notebook hierarchy—even when no notebooks are missing.

Before anything is moved, the plugin asks for confirmation and checks that all the notebooks needed by those conflicts exist. If any are still missing, it lists the notebooks that must be recreated first, from the missing notebooks reported by the scan.

## Screenshots

### Desktop

![Orphaned note and conflict repair tool panel on Joplin desktop](assets/desktop.png)

### Mobile

<img src="assets/mobile.png" alt="Orphaned note and conflict repair tool panel on Joplin mobile" width="320">

## Demo

https://github.com/user-attachments/assets/487a8a03-eedc-4969-b771-ce0f910614b7
