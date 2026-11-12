# Crossing sold pieces off from a buyer list

Buyers can send a **Copy list link** URL, **Export list** JSON or the text from **Copy list for the seller**. The owner can forward any of these to the assistant to review their interests, or say the listed pieces have sold. Match the exact `SA-` item codes, not names: distinct entries can have the same name.

An enquiry or saved list alone is not a completed sale. Change public availability only when the owner says to cross off, mark sold, or confirms the sale. Buyer imports only edit that visitor’s own list and cannot mark the public collection sold.

## Apply a confirmed list

1. Open the latest `tee-emm/sonny-collection` default branch. Keep the received file in scratch, outside the public repository.
2. Preview the exact matches:

   ```sh
   node tools/mark-sold.mjs /absolute/path/to/received-list.json
   ```

   Copied text or one shared buyer-list link works too, saved as a `.txt` file. A link captures the choices when copied; current prices and sold status come from the latest catalogue. Unknown codes reject the whole update. Repeated codes and already-sold entries do not cause duplicate changes.

3. For the owner’s confirmed sale, apply the list:

   ```sh
   node tools/mark-sold.mjs /absolute/path/to/received-list.json --apply
   npm test
   npm run check
   npm run build
   ```

4. Commit and publish `availability.json`, generated `index.html` and generated `collection.csv` on GitHub Pages. Include any other intentionally modified source files. Verify the Pages deployment succeeds. Report which item codes changed and how many remain available.

Only the versioned list of sold item codes is saved in `availability.json`. Do not commit a buyer’s file, name, contact information, message, or payment details. Keep `collection.json`, photographs and research intact.

The build crosses out sold cards, labels them in details, disables adding them to new lists, and includes availability in the CSV. Existing or imported buyer lists retain sold entries with a clear label, excluding them from estimated totals and quote counts. No pieces are removed from the historical catalogue. Research subtotals describe the original research snapshot rather than remaining stock.

## Undo a sale status

Use the same list with `--restore --apply`, then build and publish again. Only those exact item codes become available; other sales are preserved.

There are no demo sales in the initial availability file. Test sales in an isolated fixture or local preview, and restore the correct availability before publishing.
