const express = require("express");
const fs = require("fs");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3000;

// app.use(express.json());

const botToken = "xoxb-934063095335-4012794661457-MXacNp8j2m7edxUjU2RUoeSe";

const rideLocations = ["north", "west", "collegetown"];

app.get("/", (req, res) => {
  res.send("Hello World!");
});

function readData() {
  const rawData = fs.readFileSync("data.json");
  return JSON.parse(rawData);
}

function writeData(data) {
  const newData = JSON.stringify(data);
  fs.writeFileSync("data.json", newData);
}

function updateAux(isRider, req, res) {
  console.log(req);
  const text = req.header.text.toLowerCase().split(" ");
  const location = text[0];
  if (isRider) {
    var maxPassengers = parseInt(text[1]);
  }

  // Check if the location is valid
  if (rideLocations.includes(location)) {
    // Read the data.json file and parse it into a JSON object
    let data = readData();

    // If the user is already in the data.json file, update the location;
    // otherwise, add the user & location to the data.json file
    let riderOrDriverArray = isRider ? data.riders : data.drivers;

    const userId = req.header.user_id;
    const riderIds = riderOrDriverArray.map((rider) => rider.id);
    if (userId in riderIds) {
      const index = riderIds.indexOf(userId);
      riderOrDriverArray[index].location = location;
    } else {
      riderOrDriverArray.push({
        id: userId,
        name: req.header.user_name,
        location,
        ...(!isRider && { maxPassengers }),
      });
    }

    // Write the updated data to the data.json file
    writeData(data);

    res.send(
      `Successfully confirmed: ${req.header.user_name} => ${req.header.text}`
    );
  } else {
    res.send(`Sorry, ${req.header.text} is not a valid location.`);
  }
}

app.post("/update/rider", (req, res) => {
  updateAux(true, req, res);
});

app.post("/update/driver", (req, res) => {
  updateAux(false, req, res);
});

app.post("/delete/driver", (req, res) => {
  // Read the data.json file and parse it into a JSON object
  let data = readData();

  // Delete the driver from the data.json file
  const userId = req.header.user_id;
  const drivers = data.drivers;

  const index = drivers.findIndex((driver) => driver.id === userId);
  if (index === -1) {
    res.send(`Sorry, ${req.header.user_name} is not a valid driver.`);
  } else {
    drivers.splice(index, 1);

    // Write the updated data to the data.json file
    writeData(data);

    res.send(`Successfully deleted: ${req.header.user_name}`);
  }
});

app.get("/latest_ts", (req, res) => {
  const data = readData();
  res.send(data.ts);
});

function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

app.post("/generate_assignments", (req, res) => {
  let data = readData();

  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
    params: {
      channel: "C040PS45KBJ",
      timestamp: data.ts,
    },
  };

  axios
    .get("https://slack.com/api/reactions.get", config)
    .then((response) => {
      const rxns = response.data.message.reactions;
      if (!rxns) {
        res.send("No one reacted to the message.");
      } else {
        const usersWhoReacted = rxns.map((rxn) => rxn.users).flat();
        // const usersWhoReactedUniq = [...new Set(usersWhoReacted)];
        const usersWhoReactedUniq = ["e", "f", "g", "h", "i", "j", "k", "l"];

        let driverRiderMap = {};
        let ridersWithoutDriver = [];
        for (const driver of data.drivers) {
          driverRiderMap[driver.name] = [];
        }

        for (const userId of usersWhoReactedUniq) {
          // Introduce randomness to the assignment process
          shuffle(data.drivers);

          const rider = data.riders.find((rdr) => rdr.id === userId);
          if (rider) {
            const driver = data.drivers.find(
              (drv) =>
                drv.location === rider.location &&
                drv.maxPassengers - driverRiderMap[drv.name].length > 0
            );
            if (driver) {
              driverRiderMap[driver.name].push(rider.name);
            } else {
              ridersWithoutDriver.push(rider.name);
              console.log(`No driver found for ${rider.name}`);
            }
          }
        }
        const assignments = Object.entries(driverRiderMap).map(
          ([driver, riders]) => {
            return `${driver} => ${riders.join(", ")}`;
          }
        );
        const assignmentsStr = `${assignments.join(
          "\n"
        )}\n\nUnassigned riders: ${ridersWithoutDriver.join("\n")}`;
        res.send(assignmentsStr);

        // Write the message to the Slack channel
        const config = {
          headers: { Authorization: `Bearer ${botToken}` },
        };
        const message = {
          channel: "C040PS45KBJ",
          text: assignmentsStr,
        };
        axios.post("https://slack.com/api/chat.postMessage", message, config);
      }
    })
    .catch((error) => {
      console.log(error);
    });
});

app.post("/events", (req, res) => {
  res.send(req.body.challenge);
  res.end();

  // Looks like I don't need to use the Events API because I can just
  // read all the reactions on the target message at a specific time.
  // Will leave this here for now.
  // switch (req.body.type) {
  //   case "reaction_added":
  //     let data = readData();
  //     if (data.ts === req.body.event_ts) {
  //       ...
  //     }
  // }
});

// Send a message to the #prayermeeting channel (CTEJU34FN)
// #bot-test channel (C040PS45KBJ)
app.get("/send/test", (req, res) => {
  const message = {
    channel: "C040PS45KBJ",
    text: "Hello World!",
  };
  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
  };

  axios.post("https://slack.com/api/chat.postMessage", message, config).then(
    (messageRes) => {
      res.send(messageRes.data.ts);
    },
    (error) => {
      res.send(error);
    }
  );
});

function sendDailyReminderMessage(req, res) {
  // Compute tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow
    .toLocaleDateString()
    .split("/")
    .slice(0, 2)
    .join("/");

  const message = {
    channel: "C040PS45KBJ",
    text: `<!channel> If you would like a ride to EMP tmrw (${tomorrowStr}), please react to this message :) beep boop`,
  };
  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
  };

  axios.post("https://slack.com/api/chat.postMessage", message, config).then(
    (messageRes) => {
      res.send(messageRes.data.ts);
      console.log(messageRes.data.ts);

      let data = readData();
      data.ts = messageRes.data.ts;
      writeData(data);
      console.log(data);
    },
    (error) => {
      res.send(error);
    }
  );
}

// Send a message to the #prayermeeting channel (CTEJU34FN)
app.get("/send/daily", (req, res) => {
  sendDailyReminderMessage(req, res);
});

app.listen(port, () => {
  console.log(`PrayeRS listening on port ${port}`);
});
