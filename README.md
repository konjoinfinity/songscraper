# Song Scraper 🎶🎵🎸🎹📄

## An ultimate-guitar chord chart scraper that creates a new google doc and applies formatting.

![Google Drive](https://img.shields.io/badge/Google%20Drive-4285F4?style=for-the-badge&logo=googledrive&logoColor=white)
![Google Cloud](https://img.shields.io/badge/GoogleCloud-%234285F4.svg?style=for-the-badge&logo=google-cloud&logoColor=white)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Pupeteer](https://img.shields.io/badge/Puppeteer-40B5A4?style=for-the-badge&logo=Puppeteer&logoColor=white)

## Features

- [x] Accepts an ultimate-guitar url, scrapes the song data, creates a new google docs document from a template with the song name, and inserts the formatted text into the song template.
- [x] Removes '[ ]' brackets from section titles.
- [x] Recognizes various musical chords and associated notation.
- [x] Filters and updates formatting (bold/unbold) for section titles, chords, lyrics, and more.
- [x] Automatically renames the document as: 'song name - artist'.
- [x] Automatically opens and closes the browser.
- [x] Works with a variety of song formats from Ultimate Guitar, removes comments, splits the text to fit into two columns.
- [x] Adding the ability to choose the song key/capo. ***This works but you have to know how many steps up or down ahead of time***

## Room for Improvement

- [ ] Adding another browser tab/window the newly created document after completion.
- [ ] Proxy for puppeteer, to appear from a different IP address each scrape.
- [ ] Adding human like actions like clicking, moving the mouse randomly, selecting, etc. to appear as a normal user.
- [ ] Logic to recognize repeating chord patterns within sections, delete duplicates and move chord progression next to the section title.
- [ ] Automatically export to PDF and download after doc creation and formatting completes.
- [ ] Deploy to a live url, not necessary but might be useful in the future.

## Tech/frameworks used

 - @google-cloud/local-auth
 - @googleapis/docs
 - @types/node
 - axios
 - cheerio
 - googleapis
 - node-fetch
 - puppeteer
 - request
 - request-promise

## Motivation

Built to automate a manual process. I copy chord charts from ultimate-guitar and manually format song chart documents, this program automates that process.

## Screnshots

![je](https://user-images.githubusercontent.com/46323883/235279813-59508b30-e894-4488-b88e-c9ed06468d63.png)

![Middle](https://user-images.githubusercontent.com/46323883/235279818-5345229f-90d0-4423-b4e1-f601b8081260.png)

![ssje](https://user-images.githubusercontent.com/46323883/235279875-9a96ad1f-c4a7-4e3e-8eb7-eaf6f65d85dc.png)

## License

MIT © [Konjo Tech - Wesley Scholl](2023)
