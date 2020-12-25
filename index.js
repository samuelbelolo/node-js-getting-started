const express = require("express");
// const jsdom = require("jsdom");
// const { JSDOM } = jsdom;
const fetch = require("node-fetch");
const PORT = process.env.PORT || 5000;
const phantom = require("phantom");
const path = require("path");

express()
  .get("/test", (req, res) => {
    res.sendFile(path.join(__dirname + "/index.html"));
  })
  .get("/", (req, res) => {
    res.json({ error: true, message: "need a slug" });
  })
  .get("/:slug", async (req, res) => {
    try {
      const infos = {};
      await getPage(req.params.slug); // get page
      const data = await getList(req.params.slug); // Get memories

      const instance = await phantom.create();
      const page = await instance.createPage();
      await page.on("onResourceRequested", function (requestData) {
        console.info("Requesting", requestData.url);
      });
      await page.open(`${req.protocol}://${req.get("host")}/test`);
      infos.ceremonyNumber = await getContentNumber(data.ceremony, page);
      infos.memoriesNumber = await getContentNumber(data.memory, page);
      const result = {};
      result.slug = req.params.slug;
      const infosTomes = getTomesInfos(infos);

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
      res.json(result);
    } catch (error) {
      res.json(error);
    }
  })
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const getPage = async (slug) => {
  const url = `https://api.inmemori.com/pages/${slug}`;
  return new Promise((resolve, reject) => {
    return fetch(url) // fetch page link
      .then((response) => {
        response.json().then((msg) => {
          if (msg.hasOwnProperty("err") || msg.length === 0) {
            reject({ error: true, message: "incorrect slug" });
          }
          resolve(msg);
        });
      });
  });
};
const getList = async (slug) => {
  const url = `https://api.inmemori.com/memories/list/${slug}?byCategory=true`;
  return new Promise((resolve, reject) => {
    return fetch(url) // fetch list link
      .then((response) => {
        response.json().then((msg) => {
          resolve(msg);
        });
      });
  });
};

const getContentNumber = async (array, page) => {
  let i = 0;
  for (const element of array) {
    if (element.message != "") {
      element.message = await cutSentence(page, element.message); // check if the message is not higher than normal pages
      i += element.message.length; // add numbers of pages for the text
    }
    i += element.images.length;
  }
  return i; // return count
};

const isTooLong = async (page, text) => {
  return await page.evaluate(function (str) {
    const el = document.querySelector("p");
    el.innerText = str;
    return el.offsetHeight;
  }, text);
};

const dichotoText = async (page, string, count) => {
  const len = string.length;
  let middle = Math.ceil(len / 2);
  const ceil = count > 0 ? 548 : 493;
  const result = await isTooLong(page, string);
  // console.log(result);
  if (result <= ceil) {
    return string;
  } else if (result > ceil) {
    let next = string.substring(0, middle);
    if (/^\S/.test(string.substring(middle))) {
      next = next.replace(/\s+\S*$/, ""); // not cuting inside a word
    }
    return dichotoText(page, next, count);
  }
};

const cutSentence = async (page, text) => {
  let res = []; // final array
  let count = 0;
  do {
    const final = await dichotoText(page, text, count);
    res.push(final);
    text = text.replace(res[res.length - 1], ""); // remove text that fit
    count++;
  } while (text !== ""); // while all text not shorted
  return res;
};

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
