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
  async scraper(browser, ugUrl) {
    ugUrl && console.log(ugUrl);
    let page = await browser.newPage();
    await page.setViewport({ width: 1350, height: 850 });
    ugUrl && console.log(`Navigating to ${ugUrl}...`);
    ugUrl &&
      (await page
        .goto(ugUrl, { waitUntil: "domcontentloaded" })
        // then function that fires after the doc is loaded, then clicks the capo button n times
        .then(async() => {
          // await page.waitForSelector('section > div:nth-child(7) > div > span.NWgb3 > button:nth-child(3)');
          // let capo = 5;
          // console.log(capo);
          //   for(var i=0;i<capo;i++){
          //      // click +1
          //     //page.click('section > div:nth-child(7) > div > span.NWgb3 > button:nth-child(3)')
          //      // click -1
          // page.click("section > div:nth-child(7) > div > span.NWgb3 > button:nth-child(1)")
          //   }
          //   console.log(capo)
        }));


    // to select capo from page
    // no logic to check 'no capo' - check if first character is n or number
    // let capo = await page.$$eval("table > tr:nth-child(4) > td > span", options =>{
    // 	return options.map(option => option.textContent);
    // });
    // capo = Number(capo.join('').charAt(0))
    await page.waitForSelector(".P8ReX");
    let first;
    let second;
    let third;
    let newTitle;

    setTimeout(async () => {
      first = await page.$$eval("pre", (options) => {
        return options.map((option) => option.textContent);
      });
      second = await page.$$eval("header > div > h1", (options) => {
        return options.map((option) => option.textContent);
      });
      third = await page.$$eval("header > div > span > a", (options) => {
        return options.map((option) => option.textContent);
      });

      second = second.join("");
      third = third.join("");
      second = second.replace(" Chords", "");
      third = third.replace("Edit", "");
      newTitle = second + "- " + third;
      first = first.join("");
      console.log(first)
      console.log(second)
      console.log(third)
      console.log(newTitle)

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
        "Solo Chords",
        "Riff 1",
        "Riff 2",
        "Riff 1 cont.",
        "Break 1",
        "Break 2",
        "Break",
        "Chords",
        "Chorus 5",
        "Chorus 6",
        "Chorus 7",
        "Chorus 8",
        "Pre Chorus",
        "Verse I",
        "Verse II",
        "Verse III",
        "Verse IV"
      ];

      sectionTitles.forEach((title) => {
        first = first.replaceAll(`[${title}]`, `${title}`);
      });

      let chartArr = first.split(/\r\n|\r|\n/);
      let newFirstIndex;

      for (var i = 0; i < 25; i++) {
        let found = false;
  if (sectionTitles && sectionTitles.length > 0) {
    found = sectionTitles.some((v) => chartArr[i] && chartArr[i].trim() == v);
  }
        console.log(found);
        if (found === true) {
          newFirstIndex = i;
          break;
        }
      }

      let newArr = chartArr.slice(0, 52);
      for (var i = 49; i > 34; i--) {
        if (newArr[i] === " ") {
          indexToSplit = i;
          console.log(indexToSplit);
          break;
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
          /(Chorus|Verse|Verse 1|Verse 2|Intro|Pre-chorus|Interlude|Bridge|Intro Tab|Instrumental|Outro|Solo|Post-Chorus|Bridge 1|Bridge 2|Chorus 1|Chorus 2|Verse 3|Verse 4|Verse 5|Outro Solo|Harmonies|Coda|Pre-Chorus|Chorus 3|Chorus 4|Refrain|Bridge 3|Transition|Interlude Solo|Verse 6|Verse 7|Pre-Chorus A|Pre-Chorus B|Pre-Verse|Link|Solo Part 1|Solo Part 2|Fill|Intro 1|Intro 2|Riff|Riff 1|Riff 2|Interlude 1|Interlude 2|Chorus\/Outro|Riff\/Instrumental|Capo|Instrumental Fill|Solo Chords|Riff 1|Riff 2|Riff 1 cont.|Break 1|Break 2|Break|Chorus 5|Chorus 6|Chorus 7|Chorus 8|Pre Chorus|Verse I|Verse II|Verse III|Verse IV)/gi;
        const chords =
          /[A-G][#b]?\d?(m|maj|dim|aug|sus|add|mmaj)?\d?(\/[A-G][#b]?\d?)?\*?\*?\*?(\s+[A-G][#b]?\d?(m|maj|dim|aug|sus|add|mmaj)?\d?(\/[A-G][#b]?\d?)?\*?\*?\*?)*(?:\s+slide)?(?:\s+N.C.)?(?:\s+x\d\d?\d?\d?\d?\d?)?(?:|)?(?:\:)?/g;
       
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

        let newFirst = first.split(/\n/);
        newFirst = newFirst.splice(newFirstIndex);
        newFirst.forEach((line, index) => {
          let isTitles = titles.test(line);
          let isChords = chords.test(line.trim());
          if (Number(index) <= Number(indexToSplit)) {
            if (!isTitles && !isChords) {
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

        const filteredRequests = requests.filter(req => {
          if (req.updateTextStyle && req.updateTextStyle.range.startIndex === req.updateTextStyle.range.endIndex) {
            // Exclude updateTextStyle requests with empty ranges
            return false;
          }
          return true;
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
                    let isTitles = titles.test(
                      line.paragraph.elements[0].textRun.content
                    );
                    let isChords = chords.test(
                      line.paragraph.elements[0].textRun.content.trim()
                    );
                    if (!isTitles && !isChords) {
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

        console.log(JSON.stringify(filteredRequests));
        await drive.files.copy(
          {
            fileId: "1xM26IwbTj7L9VNXwDLyXV4ZWSdLUvRybDclq_u46My4",
            resource: { name: newTitle },
          },
          async (err, driveResponse) => {
            if (err) {
              console.log(err);
            }
            documentCopyId = driveResponse?.data.id;
            console.log(driveResponse?.data.id);
            const updateResponse = await docs.documents.batchUpdate({
              documentId: documentCopyId,
              requestBody: {
                requests: filteredRequests,
              },
            });
            console.log(updateResponse.data);
            updateResponse.data && getNewSong(documentCopyId);
          }
        );
      }
      authorize().then(listFiles).catch(console.error);
    }, 100);
    setTimeout(async () => {
      await browser.close();
    }, 5000);
  },
};

module.exports = scraperObject;
