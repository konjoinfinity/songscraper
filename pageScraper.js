const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

let documentCopyId;
var indexToSplit;

const SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
];

const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "creds.json");

const scraperObject = {
  url: "https://tabs.ultimate-guitar.com/tab/tenacious-d/tribute-chords-430451",
  async scraper(browser) {
    let page = await browser.newPage();
    await page.setViewport({ width: 1350, height: 850 }); 
    console.log(`Navigating to ${this.url}...`);
    await page.goto(this.url)
    await page.waitForSelector(".P8ReX");
    await page.evaluate(() => window.stop());

    let first;
    let second;
    let third;
    let newTitle;

    setTimeout(async () => {
      first = await page.$$eval("pre > span", (options) => {
        return options.map((option) => option.textContent);
      });
      second = await page.$$eval("header > h1", (options) => {
        return options.map((option) => option.textContent);
      });
      third = await page.$$eval("header > span > a", (options) => {
        return options.map((option) => option.textContent);
      });

      second = second.join("");
      third = third.join("");
      second = second.replace(" Chords", "");
      third = third.replace("Edit", "");
      newTitle = second + " - " + third;
      first = first.join("");

      let sectionTitles = [
        "Chorus",
        "Verse",
        "Verse 1",
        "Verse 2",
        "Intro",
        "Pre-chorus",
        "Interlude",
        "Bridge",
        "Intro Tab",
        "Instrumental",
        "Outro",
        "Solo",
        "Post-Chorus",
        "Bridge 1",
        "Bridge 2",
        "Chorus 1",
        "Chorus 2",
        "Verse 3",
        "Verse 4",
        "Verse 5",
        "Outro Solo",
        "Harmonies",
        "Chorus/Outro",
        "Pre-Chorus",
        "Chorus 3",
        "Chorus 4",
        "Refrain",
        "Bridge 3",
        "Transition",
        "Interlude Solo",
        "Verse 6",
        "Verse 7",
        "Pre-Chorus A",
        "Pre-Chorus B",
        "Pre-Verse",
        "Link",
        "Solo Part 1",
        "Solo Part 2",
        "Fill",
        "Intro 1",
        "Intro 2",
        "Riff",
        "Interlude 1",
        "Interlude 2",
        "Riff/Instrumental",
        "Coda",
        "Capo",
        "Instrumental Fill",
        "Solo Chords"
      ];

      sectionTitles.forEach((title) => {
        first = first.replaceAll(`[${title}]`, `${title}`);
      });

      let chartArr = first.split(/\r\n|\r|\n/);
      let newArr = chartArr.slice(0, 52);

      for (var i = 49; i > 34; i--) {
        if (newArr[i] === " ") {
          indexToSplit = i;
          break;
        } else {
          console.log("this is a line: " + i);
        }
      }

      /**
       * Reads previously authorized credentials from the save file.
       *
       * @return {Promise<OAuth2Client|null>}
       */
      async function loadSavedCredentialsIfExist() {
        try {
          const content = await fs.readFile(TOKEN_PATH);
          const credentials = JSON.parse(content);
          return google.auth.fromJSON(credentials);
        } catch (err) {
          return null;
        }
      }

      /**
       * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
       *
       * @param {OAuth2Client} client
       * @return {Promise<void>}
       */
      async function saveCredentials(client) {
        const content = await fs.readFile(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const payload = JSON.stringify({
          type: "authorized_user",
          client_id: key.client_id,
          client_secret: key.client_secret,
          refresh_token: client.credentials.refresh_token,
        });
        await fs.writeFile(TOKEN_PATH, payload);
      }

      /**
       * Load or request or authorization to call APIs.
       *
       */
      async function authorize() {
        let client = await loadSavedCredentialsIfExist();
        if (client) {
          return client;
        }
        client = await authenticate({
          scopes: SCOPES,
          keyfilePath: CREDENTIALS_PATH,
        });
        if (client.credentials) {
          await saveCredentials(client);
        }
        return client;
      }

      /**
       * Lists the names and IDs of up to 10 files.
       * @param {OAuth2Client} authClient An authorized OAuth2 client.
       */
      async function listFiles(authClient) {
        const drive = google.drive({ version: "v3", auth: authClient });
        const docs = google.docs({ version: "v1", auth: authClient });
        const titles =
          /(Chorus|Verse|Verse 1|Verse 2|Intro|Pre-chorus|Interlude|Bridge|Intro Tab|Instrumental|Outro|Solo|Post-Chorus|Bridge 1|Bridge 2|Chorus 1|Chorus 2|Verse 3|Verse 4|Verse 5|Outro Solo|Harmonies|Coda|Pre-Chorus|Chorus 3|Chorus 4|Refrain|Bridge 3|Transition|Interlude Solo|Verse 6|Verse 7|Pre-Chorus A|Pre-Chorus B|Pre-Verse|Link|Solo Part 1|Solo Part 2|Fill|Intro 1|Intro 2|Riff|Interlude 1|Interlude 2|Chorus\/Outro|Riff\/Instrumental|Capo|Instrumental Fill|Solo Chords)/gi;
        const chords =
          /^[A-G][#b]?(m|maj|dim|aug|sus)?\d?(\/[A-G][#b]?)?(\s+[A-G][#b]?(m|maj|dim|aug|sus)?\d?(\/[A-G][#b]?)?)*$/;
        const numTimes = /x\d/g;
        var indexCount = 4;
        const requests = [
          {
            replaceAllText: {
              replaceText: newTitle,
              containsText: {
                text: "Song Title - Artist Name",
                matchCase: true,
              },
            },
          },
        ];

        first.split(/\n/).forEach((line, index) => {
          let isTitles = titles.test(line)
          let isChords = chords.test(line.trim())
          let isNumTimes = numTimes.test(line)
          if (Number(index) <= Number(indexToSplit)) {
            if (!isTitles && !isChords && !isNumTimes && !line.includes("add") && !line.includes("|") && !line.includes("x-") && !line.includes("-x") && !line.includes("N.C.") && !line.includes("mmaj")) {
              requests.push({
                insertText: {
                  text: line,
                  location: {
                    index: indexCount + 1,
                  },
                },
              });
              requests.push({
                updateTextStyle: {
                  range: {
                    startIndex: indexCount + 1,
                    endIndex: indexCount + line.length,
                  },
                  textStyle: {
                    bold: false,
                  },
                  fields: "bold",
                },
              });
              indexCount = indexCount + line.length;
            } else {
              requests.push({
                insertText: {
                  text: line,
                  location: {
                    index: indexCount + 1,
                  },
                },
              });
              requests.push({
                updateTextStyle: {
                  range: {
                    startIndex: indexCount + 1,
                    endIndex: indexCount + line.length,
                  },
                  textStyle: {
                    bold: true,
                  },
                  fields: "bold",
                },
              });
              indexCount = indexCount + line.length;
            }
          }
        });

        console.log(indexCount);
        let chartArr = first.split(/\n/);
        let colChart2 = chartArr.slice(indexToSplit + 1, chartArr.length);
        let toWrite = colChart2.join("\r\n");
        requests.push({
          replaceAllText: {
            replaceText: toWrite,
            containsText: {
              text: "col2",
              matchCase: true,
            },
          },
        });

        let unboldRequests = [];
        async function unboldLyrics(id) {
          console.log(JSON.stringify(unboldRequests));
          await docs.documents.batchUpdate({
            documentId: id,
            requestBody: {
              requests: unboldRequests,
            },
          });
        }

        async function getNewSong(id) {
          await docs.documents
            .get({
              documentId: id,
              fields:
                "body(content(table(tableRows(tableCells(content(paragraph(elements(endIndex,startIndex,textRun/content))))))))",
            })
            .then(
              (response) => {
                console.log(
                  "Response",
                  JSON.stringify(
                    response.data.body.content[2].table.tableRows[0]
                      .tableCells[1].content
                  )
                );
                response.data.body.content[2].table.tableRows[0].tableCells[1].content.forEach(
                  (line) => {
                    console.log(line.paragraph.elements[0].textRun.content);
                    let isTitles = titles.test(line.paragraph.elements[0].textRun.content)
                    let isChords = chords.test(line.paragraph.elements[0].textRun.content.trim())
                    let isNumTimes = numTimes.test(line.paragraph.elements[0].textRun.content)
                    if (!isTitles && !isChords && !isNumTimes && !line.paragraph.elements[0].textRun.content.includes("add") && !line.paragraph.elements[0].textRun.content.includes("|") && !line.paragraph.elements[0].textRun.content.includes("x-") && !line.paragraph.elements[0].textRun.content.includes("-x") && !line.paragraph.elements[0].textRun.content.includes("N.C.") && !line.paragraph.elements[0].textRun.content.includes("mmaj")) {
                      unboldRequests.push({
                        updateTextStyle: {
                          range: {
                            startIndex: line.paragraph.elements[0].startIndex,
                            endIndex: line.paragraph.elements[0].endIndex,
                          },
                          textStyle: {
                            bold: false,
                          },
                          fields: "bold",
                        },
                      });
                    }
                  }
                );
              },
              (err) => {
                console.error("Execute error", err);
              }
            )
            .finally(() => {
              unboldLyrics(id);
            });
        }

        console.log(JSON.stringify(requests));
        await drive.files.copy(
          {
            fileId: "1xM26IwbTj7L9VNXwDLyXV4ZWSdLUvRybDclq_u46My4",
            resource: { name: newTitle },
          },
          async (err, driveResponse) => {
            documentCopyId = driveResponse.data.id;
            console.log(driveResponse.data.id);
            const updateResponse = await docs.documents.batchUpdate({
              documentId: documentCopyId,
              requestBody: {
                requests: requests,
              },
            });
            console.log(updateResponse.data);
            updateResponse.data && getNewSong(documentCopyId);
          }
        );
      }
      authorize().then(listFiles).catch(console.error);
    }, 100);
  },
};

module.exports = scraperObject;
