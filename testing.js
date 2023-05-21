// let str1 = [
//   "e|-3/5-3----------3/5-2---------------------------------------3/5-3----------|",
//   "B|-3/5-3----------3/5-3----------3/5-0----------0-0h1---------3/5-3----------|",
//   "G|-------------------------------2/4-0----------0-0--------------------------|",
//   "D|---------------------------------------------------------------------------|",
//   "A|---------------------------------------------------------------------------|",
//   "E|---------------------------------------------------------------------------|",
//   "| G  Bm  | Em  D  | C     | A7    |",
//   "| C G | Am  | Dm  | G   |",
//   "| C G | Am  | Dm  | Bb  Bb A G# G | F#   |",
//   "| C   | C   | C   | D   |",
//   "|(C)  | C   | C   | D   | N.C.|",
//   "| Ab  | F   | G   | G   | G   |",
//   "| C  G  | Am  E Am | E Am G C | B  Em | F  C  |",
//   "|(C) F/C | C  Cdim |",
//   "| G/B  Gm/Bb | A    Bbdim | A A7 D    |",
//   "G       x-x-5-4-3-x",
//   "D/F#    x-x-4-2-3-x",
//   "Ddim/F  x-x-3-1-3-x",
//   "Em7     x-x-2-0-3-x",
//   "Am Ammaj9 Am7 D/F# Fmaj7 G Am",
//   "Am Ammaj9 Am7 D/F# Fmaj7 G Am",
//   "C D Fmaj7 Am C G D",
//   "C D Fmaj7 Am",
//   "C D D",
//   "Bbadd9/D   Gm7add11   F   Eb",
//   "| G/B  Gm/Bb | A    Bbdim | A A7 D    |",
//   "G       x-x-5-4-3-x",
//   "Am  Am/G  Fmaj7    x4",
//   "Am  Am/G  Fmaj7    x10",
// "G B A F x2",
// "E C Bb A# x4",
// "Em F Gm7 Amaj7 x10",
// "G C A",
// "B F E"]

// let str2 = "A G C E F#mmaj N.C. x-x-3-4-5-x Aadd9 |"
// // const chords = /^[A-G][#b]?(m|maj|dim|aug|sus|add)?[0-9]?\d?(\/[A-G][#b]?)?(\s+[A-G][#b]?(m|maj|dim|aug|sus)?\d?(\/[A-G][#b]?)?)*$/;

// // console.log(str2.match(/[0-9]$/));

// let arr1 = []
// let arr2 =[]
// let check = ["|", "add9", "add11", "add13", "mmaj"]

// str1.forEach(line => {
//   check.forEach(arg => {
//     if (line.includes(arg)) {
//       arr1.push(line)
//     }
//   })
// })

// // console.log(arr1)
// let regexArr =[/add\d/g, /x\d/g, /mmaj/g, /\|/g, /(-)?x(-)?/g];

// str1.forEach(line => {
//   regexArr.forEach(reg => {
//       if(line.match(reg)) {
//     arr2.push(line)
//   }
//   })
// })
// console.log(arr2);


const titles = /(Chorus|Verse|Verse 1|Verse 2|Intro|Pre-chorus|Interlude|Bridge|Intro Tab|Instrumental|Outro|Solo|Post-Chorus|Bridge 1|Bridge 2|Chorus 1|Chorus 2|Verse 3|Verse 4|Verse 5|Outro Solo|Harmonies|Coda|Pre-Chorus|Chorus 3|Chorus 4|Refrain|Bridge 3|Transition|Interlude Solo|Verse 6|Verse 7|Pre-Chorus A|Pre-Chorus B|Pre-Verse|Link|Solo Part 1|Solo Part 2|Fill|Intro 1|Intro 2|Riff|Interlude 1|Interlude 2|Chorus\/Outro|Riff\/Instrumental)/gi;
const chords = /^[A-G][#b]?(m|maj|dim|aug|sus|add|mmaj)?\d?(\/[A-G][#b]?)?\*?\*?\*?(\s+[A-G][#b]?(m|maj|dim|aug|sus|add|mmaj)?\d?(\/[A-G][#b]?)?\*?\*?\*?)*$/;
// const addCheck = /add\d/g;
const numTimes = /x\d/g;
const minMaj = /mmaj\d/g;
const pipeOr = /\|/g;
const xOrDash = /(-)?x(-)?/g;
const noChord = /N.C./g;
const dubDash = /[--][--]?/g

// console.log(noChord.test(str1))

// function checkRegex(str){
//    let checkedStr = []
//    let regexes = [titles, chords, addCheck, numTimes, minMaj, pipeOr, xOrDash, noChord]
//    regexes.forEach(reg => {
//      reg.test(str) ? checkedStr.push(true) : checkedStr.push(false)
//    })              
//          let checker = checkedStr.every(v => v === true);
//          console.log(checkedStr)
//   console.log(checker)
//        }

// checkRegex(str2)

// let strg = [
//   "Am Ammaj9 Am7 D/F# Fmaj7 G Am",
//   "Am Ammaj9 Am7 D/F# Fmaj7 G Am",
//   "Bmmaj7 C D Em"]

// let strg2 = [
//   'D   -     -     C   D    -     -   C',
//   'D     -  -     C   D        -   -',
//   'A - - -               C - - -',
//   'D - - -                      A - - -',
//   'A - - -                   C - - -',
//   'D - - -                  A - - -   E - - - G -',
//   'A - - -  C - - -  D - - -  A - - -',
//   'A - - -  C - - -  D - - -  A - - -',
//   "Am Ammaj9 Am7 D/F# Fmaj7 G Am",
//   "Am Ammaj9 Am7 D/F# Fmaj7 G Am",
//   "Bmmaj7 C D Em"
// ]

// strg2.forEach(a => {
//   console.log(`----------------`);
//   console.log(a);
//   console.log(dubDash.test(a));
// })


let lyricStr = `
Capo 2
 
Tutorial video: http://www.youtube.com/watch?v=vhSN7nAXc9A
 
[Chords]
G: 3x0033      A7sus4: x02033    G/F#: 2x0033     Cadd9: x32033
C*: x32013
G*: 320003     D/F#: 20023x      Dadd4: x54035
NB for beginners, ignore the variations and just play normal C and G chords throughout, it's easier.
I put them in because it does sound better to play them, but it's not completely necessary.
 
[Intro]
G   G   G/F# Em  Cadd9  G
 
[Verse 1]
G                                 G/F#      Em
White lips, pale face, breathing in snowflakes
         Cadd9        G        A7sus4
Burnt lungs, sour taste
G                                      G/F#   Em
Light’s gone, day’s end, struggling to pay rent
          Cadd9       G
Long nights, strange men
 
[Pre-Chorus]
Am7                              C*                   G*
And they say she’s in the Class A Team, stuck in her daydream
                    D/F#               Am7                          C*
Been this way since 18, but lately her face seems, slowly sinking, wasting
               G*                            D/F#
Crumbling like pastries, and they scream the worst things in life come free to us
 
[Chorus 1]
          Em           Cadd9       G
Cos she's just under the upperhand, and go mad for a couple of grams
Em                    Cadd9    G
And she don’t want to go outside tonight
         Em                    Cadd9      G
And in a pipe she flies to the Motherland, or sells love to another man
Em         Cadd9   G       D/F#      Em    Cadd9  G
It’s too cold outside for angels to fly,
              Em   Cadd9  G    G/F#
for angels to fly
 
[Verse 2]
G                                          G/F#       Em
Ripped gloves, raincoat, tried to swim and stay afloat
      Cadd9          G         A7sus4
Dry house, wet clothes
G                                     G/F#      Em
Loose change, bank notes, weary-eyed, dry throat
       Cadd9    G
Call girl, no phone
 
[Pre-Chorus]
Am7                              C*                   G*
And they say she’s in the Class A Team, stuck in her daydream
                    D/F#               Am7                          C*
Been this way since 18, but lately her face seems, slowly sinking, wasting
               G*                            D/F#
Crumbling like pastries, and they scream the worst things in life come free to us
 
[Chorus 1]
          Em           Cadd9       G
Cos she's just under the upperhand, and go mad for a couple of grams
Em                    Cadd9    G
And she don’t want to go outside tonight
         Em                    Cadd9      G
And in a pipe she flies to the Motherland, or sells love to another man
Em         Cadd9   G       D/F#      Am7
It’s too cold outside for angels to fly
 
[Bridge]
Am7           C*              Em
An angel will die, covered in white
       G/F#    G
Closed eye and hoping for a better life
Am7                       C*  slide Dadd4            Em   C*   G*  D/F#
This time, we’ll fade out tonight, straight down the line
                    Em   C*  G*  D/F#
Straight down the line
 
[Pre-Chorus]
Am7                              C*                   G*
And they say she’s in the Class A Team, stuck in her daydream
                    D/F#               Am7                          C*
Been this way since 18, but lately her face seems, slowly sinking, wasting
               G*                            D/F#
Crumbling like pastries, and they scream the worst things in life come free to us
 
[Chorus 2]
          Em           Cadd9      G
And we're all under the upperhand, and go mad for a couple of grams
Em                   Cadd9    G
And we don’t want to go outside tonight
         Em                    Cadd9      G
And in a pipe we'll fly to the Motherland, or sell love to another man
Em         Cadd9   G       D/F#      Em    Cadd9  G
It’s too cold outside for angels to fly,
              Em   Cadd9  G   G/F#
for angels to flyyyyy
Em   Cadd9 G            G/F# Em   Cadd9    G
Flyyyy, flyyyyyy, angels to  fly, fly, flyyy
   D/F#      G
Or angels to die
 
Thanks for using my tab!
For tips, why not have a look at my cover?! http://www.youtube.com/watch?v=ZfNtf_tEy9U
`
lyricStr = lyricStr.split(/\n/)
  
  lyricStr.forEach(a => {
    console.log(`----------------`);
  console.log(a);
let isTitles = titles.test(a);
let isChords = chords.test(a.trim());
let isNumTimes = numTimes.test(a);
let isDubDash = dubDash.test(a);
    if(!isTitles &&
              !isChords &&
              !isNumTimes &&
              !isDubDash &&
              !a.includes("|") &&
              // !a.includes("x-") &&
              // !a.includes("-x") &&
              !a.includes("N.C.")){
      console.log(true)
              } else {
      console.log(false)
      console.log('isTitles = ' + isTitles)
      console.log('isChords = ' + isChords)
      console.log('isNumTimes = ' + isNumTimes)
      console.log('isDubDash = ' + isDubDash)
      console.log('Pipe = ' + a.includes("|"))
      // console.log('X Dash = ' + a.includes("x-"))
      // console.log('Dash X = ' + a.includes("-x"))
      console.log('No Chord = ' + a.includes("N.C."))
              }
})
  
  
//   `
// Don't cut the strums off quite as much as it sounds in the strumming pattern, it's not possible
// to represent it perfectly.
 
// https://youtu.be/tuK6n2Lkza0
 
// Are You Gonna Be My Girl – Jet
 
 
// Intro
 
// | A - - - | A - - - | A - - - | A - - - | (x3)
//            Let's go!!
 
 
// Verse 1
 
// N.C.
// It's a 1, 2, 3, take my hand and come with me
// N.C.                                                     A - - -
// because you look so fine and I really wanna make you mine
// N.C.                                                     A - - -
// I said you look so fine and I really wanna make you mine.
// N.C.
// 4, 5, 6, come on and get your kicks
// N.C.                                                             A - - - | - - - -
// Now you don't need that money when you look like that, do ya honey
 
// D   -     -     C   D    -     -   C
// Big black boots,     long brown hair,
// D     -  -     C   D        -   -
// She's so sweet,     with her get back stare
 
 
// Chorus
 
// A - - -               C - - -
//   Well, I could see, you home with me
// D - - -                      A - - -
//   But you were with another man, yeah
// A - - -                   C - - -
//   I, know, we ain't got, much to say
// D - - -                  A - - -   E - - - G -
//   Before I let you get away, yeah!
 
// N.C.
// I said, are you gonna be my girl
 
// | A - - - | A - - - | A - - - | A - - - |`

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
        "Riff 1 cont."
      ];

// let chartArr = lyricStr.split(/\r\n|\r|\n/);
// let newStart;

//       for (var i = 0; i < 25; i++) {
//       let found = sectionTitles.some(v => chartArr[i].includes(v))
//   console.log(found)
//       if(found === true){
//     newStart = chartArr.slice(i)
//         break;
//         } else {
//         console.log("remove line")
//         }
//       }
//   console.log(newStart)
// Write logic to slice from section title line

// How to write the logic for repeating chord patterns


        
        