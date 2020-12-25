/** IMPORT  **/
const express = require("express");
const fetch = require("node-fetch");
const PORT = process.env.PORT || 5000;
const phantom = require("phantom");
const path = require("path");

/**
 * @author Samuel Belolo <contact@samuelbelolo.com>
 * Fetch the information page  with provided slug
 * @param {string} slug - query slug
 */

const getPage = async (slug) => {
  const url = `https://api.inmemori.com/pages/${slug}`; // format utl
  return new Promise((resolve, reject) => {
    return fetch(url) // fetch page link
      .then((response) => {
        response.json().then((msg) => {
          if (msg.hasOwnProperty("err") || msg.length === 0) {
            // if not okay
            reject({ error: true, message: "incorrect slug" });
          }
          resolve(msg);
        });
      });
  });
};

/**
 * @author Samuel Belolo <contact@samuelbelolo.com>
 * Getting the list of information related to the provided slug
 * @param {string} slug - query slug
 */

const getList = async (slug) => {
  const url = `https://api.inmemori.com/memories/list/${slug}?byCategory=true`; // format url
  return new Promise((resolve, reject) => {
    return fetch(url) // fetch list link
      .then((response) => {
        response.json().then((msg) => {
          resolve(msg);
        });
      });
  });
};

/**
 * @author Samuel Belolo <contact@samuelbelolo.com>
 * return the size of the inmemory book
 * @param req - express req
 * @param res - express res
 */
const getInfos = async (req, res) => {
  try {
    const accurate = req.query.accurate === "true" ? true : false; // do we need to parse and format string messages ?
    const infos = {};
    await getPage(req.params.slug); // get page
    const data = await getList(req.params.slug); // Get memories and ceremonies

    const instance = await phantom.create(); // start phantom instance
    const page = await instance.createPage(); // create a page

    await page.open(`${req.protocol}://${req.get("host")}/test`); // open testing page
    infos.ceremonyNumber = await getContentNumber(
      data.ceremony,
      page, // getting number of ceremony
      accurate
    );
    infos.memoriesNumber = await getContentNumber(data.memory, page, accurate); // getting number of memories

    const result = {};
    result.slug = req.params.slug; // set response slug

    const infosTomes = getTomesInfos(infos); // getting details of tome(s)

    // logic to retrieve size of tome(s)
    if (infosTomes.length === 3) {
      result.size = "custom";
    } else if (infosTomes.length === 2) {
      if (infosTomes[1].total <= 54) {
        result.size = "ls";
      } else if (infosTomes[1].total <= 94) {
        result.size = "lm";
      } else if (infosTomes[1].total <= 188) {
        result.size = "ll";
      }
    } else {
      if (infosTomes[0].total <= 54) {
        result.size = "s";
      } else if (infosTomes[0].total <= 94) {
        result.size = "m";
      } else if (infosTomes[0].total <= 188) {
        result.size = "l";
      }
    }
    res.json(result); // return result
  } catch (error) {
    res.json(error);
  }
};

/**
 * @author Samuel Belolo <contact@samuelbelolo.com>
 * return number of pages (text + images)
 * @param {array} array - array to analyze : memories of ceremonies
 * @param page - phantomJS related
 * @param {bool} accurate - do we need to parse messages
 */
const getContentNumber = async (array, page, accurate) => {
  let i = 0; // counter
  for (const element of array) {
    // for every elem
    if (element.message != "") {
      // if not empty
      if (accurate) {
        // if parsing
        element.message = await cutSentence(page, element.message); // check if the message is not higher than normal pages
        i += element.message.length; // add numbers of pages for the text
      } else {
        i++; // just adding elem // Not checking if to height isn't good
      }
    }
    i += element.images.length; // adding images
  }
  return i; // return count
};

/**
 * @author Samuel Belolo <contact@samuelbelolo.com>
 * Getting height of text in index.html
 * With right font-family, font-size, max-height,...
 * @param page - PhantomJS related
 * @param text - text to retreive height
 */
const isTooLong = async (page, text) => {
  return await page.evaluate(function (str) {
    const el = document.querySelector("p"); // retrieve p
    el.innerText = str; // insert text
    return el.offsetHeight; // getting height
  }, text);
};

/**
 * @author Samuel Belolo <contact@samuelbelolo.com>
 * Recursive Dichotomie algo , testing height
 * @param page - PhantomJS related
 * @param {string} string - string to test
 * @param {int} count - used because first page should not be higher that 493px (e.g others : 548px)
 */

const dichotoText = async (page, string, count) => {
  const len = string.length; // getting length of text
  let middle = Math.ceil(len / 2); // Getting middle pos
  const ceil = count > 0 ? 548 : 493; // Height to test with
  const result = await isTooLong(page, string); // function name pretty explicit
  if (result <= ceil) {
    // if is not too long
    return string;
  } else if (result > ceil) {
    // if to long
    let next = string.substring(0, middle); // restart with smaller portion
    if (/^\S/.test(string.substring(middle))) {
      next = next.replace(/\s+\S*$/, ""); // not cuting inside a word
    }
    return dichotoText(page, next, count); // restart :)
  }
};

/**
 * @author Samuel Belolo <contact@samuelbelolo.com>
 * Getting array of formated string
 * @param page - Phantom JS related
 * @param text - text to format
 */

const cutSentence = async (page, text) => {
  let res = []; // final array
  let count = 0;
  do {
    const final = await dichotoText(page, text, count); // retrive text
    res.push(final); // push it up
    text = text.replace(res[res.length - 1], ""); // remove text to otiginal str
    count++;
  } while (text !== ""); // while all text not shorted
  return res; // return array of right text
};

/**
 * @author Samuel Belolo <contact@samuelbelolo.com>
 * Will return Tome(s) detail
 * @param {object} infos - tomes obj
 */
const getTomesInfos = (infos) => {
  const array = [];
  let totalTome = 1;

  const total =
    infos.ceremonyNumber > 0
      ? Math.ceil((infos.memoriesNumber + infos.ceremonyNumber) / 182)
      : Math.ceil(infos.memoriesNumber / 183);
  if (total > 1) {
    totalTome += total - 1;
  }
  // for each tome
  for (let index = 0; index < totalTome; index++) {
    const tome = {}; // init
    tome.altPages = 4; // normal alternate pages : first page, blank, logo page & print page
    tome.ceremonyPages = 0; // normal ceremony number is 0
    if (index === 0 && infos.ceremonyNumber > 0) {
      // if forst tome and has ceremony
      tome.ceremonyPages = infos.ceremonyNumber; // add it
      tome.altPages += 2; // add the section page ceremony
    }
    tome.memoriesPages = infos.memoriesNumber; // add the number of ceremony

    // at this point we have added ALL the ceremony, we could have by now multiple tome
    if (tome.altPages + tome.ceremonyPages + tome.memoriesPages >= 188) {
      // if total of pages > 188
      tome.notesPages = 0; // no notes pages (fill everything)
      tome.memoriesPages = 188 - (tome.ceremonyPages + tome.altPages); // number of memories of this specific tome
    } else if (tome.altPages + tome.ceremonyPages + tome.memoriesPages <= 54) {
      // if size S
      tome.notesPages =
        54 - (tome.altPages + tome.ceremonyPages + tome.memoriesPages); // number of notes
      if (tome.notesPages > 0) {
        tome.altPages++; // add notepages
        tome.notesPages--;
      }

      tome.memoriesPages =
        54 - (tome.ceremonyPages + tome.altPages + tome.notesPages); // numbers of specific memories
    } else if (tome.altPages + tome.ceremonyPages + tome.memoriesPages <= 94) {
      // if size L
      tome.notesPages =
        94 - (tome.altPages + tome.ceremonyPages + tome.memoriesPages); // number of notes
      if (tome.notesPages > 0) {
        tome.altPages++; // add notes section pages
        tome.notesPages--;
      }
      tome.memoriesPages =
        94 - (tome.ceremonyPages + tome.altPages + tome.notesPages); // numbers of memories that can fill
    } else if (tome.altPages + tome.ceremonyPages + tome.memoriesPages <= 188) {
      tome.notesPages =
        188 - (tome.altPages + tome.ceremonyPages + tome.memoriesPages); // number of notes
      if (tome.notesPages > 0) {
        tome.altPages++; // add notes section pages
        tome.notesPages--;
      }
      tome.memoriesPages =
        188 - (tome.ceremonyPages + tome.altPages + tome.notesPages); // numbers of memories that can fill
    }
    if (index > 1) {
      tome.altPages = 0;
      tome.notesPages = 0;
    }

    tome.total =
      tome.altPages + tome.ceremonyPages + tome.notesPages + tome.memoriesPages; // TOTAL OF PAGES OF THIS TOME

    infos.memoriesNumber -= tome.memoriesPages; // removed memories of this tome to the total (for next tome)
    array.push(tome);
  }
  return array;
};

express()
  .get("/test", (req, res) => {
    res.sendFile(path.join(__dirname + "/index.html"));
  })
  .get("/", (req, res) => {
    res.json({ error: true, message: "need a slug" });
  })
  .get("/:slug", getInfos)
  .listen(PORT, () => console.log(`Listening on ${PORT}`));
