# Thomass’s Sonny Angel collection

A static buyer catalogue for one personal collection. The catalogue contains **280 photographed entries** from 28 research batches. Some entries show multiple figures, so the count is an entry count rather than a confirmed figure quantity.

## Full-lot sale and research totals

The collection is offered as one complete lot; individual pieces are not offered separately. Enquiry text and saved-item messages consistently refer to the full lot.

The buying section shows two explicitly labelled research subtotals: CAD 54,483 across 266 entries (raw references) and CAD 37,913 across 203 entries (filtered per-unit references). Neither is an asking price, appraisal or expected proceeds. Source quality, date and condition limitations remain visible. The underlying snapshot is recorded in `lotReferenceSummary` in `collection.json`.

## Included

- All 280 actual collection photographs, extracted unchanged from the owner’s research reports.
- Search, series and category filters, saved favourites, and direct links to an entry.
- Packaging and accessory notes, added outfits, and edition uncertainty.
- Optional market references labelled by geography, source type, event date, condition, source access and CAD conversion.
- Enquiry text to copy and a downloadable CSV item list.

The latest revision is used when the same research batch occurs twice. Distinct collection entries with similar characters remain separate. Internal collection IDs, import hashes and administrative metadata are omitted from the public catalogue.

The imported research does not contain final valuations. Market comparisons are retained as context, with no invented lot price or automatic sum. `askingPriceCAD` and `contactUrl` are initially `null`; enquiries direct visitors to message the seller where the catalogue was shared.

## Publish on GitHub Pages

This repository is ready to publish without installing packages or running a build on GitHub:

1. Create a public repository, for example `sonny-collection`, and push these files to `main`.
2. In **Settings → Pages**, choose **Deploy from a branch**, then **main** and **/(root)**.
3. Save and wait for GitHub’s Pages deployment to finish.

Paths are relative, so the catalogue works as a project site. `.nojekyll` keeps it buildless. The site uses no external fonts, trackers, server, account system or payment processing. The HTML includes `noindex, nofollow` to discourage search indexing while allowing anyone with the link to visit; this is a public site, not access control.

## Make changes

Edit `collection.json`. Each item has its own photo, name, series, packaging notes and price-reference list. Photo filenames use stable item codes such as `SA-0149`.

- Set `askingPriceCAD` to a number or decimal string to display the full-lot price in the buying section.
- Set `contactUrl` to the seller’s chosen HTTPS enquiry destination to link the enquiry buttons there. Leave it `null` to keep the copyable enquiry.
- Update the `updated` field and the displayed footer date in `tools/template.html` after a substantive edit.

Then run:

```sh
npm run check
npm run build
```

Commit the updated root `index.html`, `collection.json`, `collection.csv`, scripts, styles and assets. `dist/` is a generated preview copy and is ignored by Git.

The layout source is `tools/template.html`, presentation is `styles.css`, and browser interactions are `app.js`. There are no package dependencies.

## Evidence limits

The site reformats existing research; it does not independently recheck marketplace availability or authenticate owned figures. Source timestamps are research timestamps, not proof of recent sales. Unknown dates and uncertain identification remain visible. The user’s source and date preferences are preserved in the ordering and labels of the evidence.

The photographs belong to the collection owner. Third-party source names and linked market references identify their original sources. This is a personal catalogue, not an official Sonny Angel store.
