const express = require("express");
const fs = require("fs");
const axios = require("axios");
const bodyParser = require("body-parser");
const _ = require("lodash/core");

// Create a new express application and expose the port assigned on Heroku
const app = express();
const port = process.env.PORT || 3000;

// Get the correct Content-Type encoding for the body
app.use(bodyParser.urlencoded({ extended: true }));

// Retrieve the Slack bot token from either the env variables or secrets.json
const botToken = process.env.BOT_TOKEN || readSecrets().botToken;

// Do the same with the master key required for reading data.json
const masterKey = process.env.MASTER_KEY || readSecrets().masterKey;

// Set this to true if production-ready instead of debugging
const prod = false;

// Slack channel IDs in the Emmaus Road workspace
let publishedChannel;
let dataBinURL;
if (prod) {
  publishedChannel = "CTEJU34FN"; // #prayermeeting
  dataBinURL = "https://api.jsonbin.io/v3/b/630a88c75c146d63ca823917"; // data.json
} else {
  // publishedChannel = "C040PS45KBJ"; // #bot-test
  publishedChannel = "C0404EA855L"; // #bot-test222
  dataBinURL = "https://api.jsonbin.io/v3/b/630bcdd7e13e6063dc9009be"; // example_data.json
}

// Valid ride locations, in desired order of processing
const rideLocations = ["williams", "collegetown", "west", "north"];

// Test (default) route
app.get("/", (req, res) => {
  res.send("Hello World!");
});

function readSecrets() {
  const rawData = fs.readFileSync("secrets.json");
  return JSON.parse(rawData);
}

// function writeData(data) {
//   const newData = JSON.stringify(data);
//   fs.writeFileSync("data.json", newData);
// }

// Read the data.json file on jsonbin.io
async function readData() {
  config = {
    headers: {
      "X-Master-Key": masterKey,
    },
  };

  console.log(dataBinURL);

  return await axios
    .get(dataBinURL, config)
    .then((response) => {
      return response.data.record;
    })
    .catch((error) => {
      console.log(error);
    });
}

// Write to the data.json file on jsonbin.io
function writeData(data) {
  const newData = JSON.stringify(data);

  config = {
    headers: {
      "X-Master-Key": masterKey,
      "Content-Type": "application/json",
    },
  };
  axios.put(dataBinURL, newData, config).catch((error) => {
    console.log(error);
  });
}

// Fetch and parse the user's public name on Slack; use display name if available
function readUsername(userId) {
  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
    params: {
      user: userId,
    },
  };

  const promise = axios.get("https://slack.com/api/users.info", config);
  return promise.then((response) => {
    const profile = response.data.user.profile;
    if (profile.display_name) {
      return profile.display_name;
    } else {
      return profile.real_name;
    }
  });
}

// Auxilliary function to update rider or driver info in the data.json file
async function updateAux(isRider, req, res) {
  console.log(req);
  const text = req.body.text.toLowerCase().split(" ");
  const location = text[0];
  if (!isRider) {
    var maxPassengers = parseInt(text[1]);
  }

  // Check if the location is valid
  if (rideLocations.includes(location)) {
    // Read the data.json file and parse it into a JSON object
    let data = await readData();

    // If the user is already in the data.json file, update the location;
    // otherwise, add the user & location to the data.json file
    let riderOrDriverArray = isRider ? data.riders : data.drivers;

    const userId = req.body.user_id;
    readUsername(userId).then((username) => {
      const userName = username;

      // Find the rider or driver in the array
      const riderIds = riderOrDriverArray.map((rider) => rider.id);

      // If the rider/driver is already in the array, update the location
      if (riderIds.includes(userId)) {
        const index = riderIds.indexOf(userId);
        riderOrDriverArray[index].location = location;
        if (!isRider) {
          riderOrDriverArray[index].maxPassengers = maxPassengers;
        }
      } else {
        // Otherwise, add the rider/driver to the array
        riderOrDriverArray.push({
          id: userId,
          name: userName,
          location,
          ...(!isRider && { maxPassengers }),
        });
      }

      // Write the updated data to the data.json file
      writeData(data);
      console.log(data);

      if (isRider) {
        res?.send(`Successfully updated rider ${userName} to ${location}.`);
      } else {
        res?.send(
          `Successfully updated driver ${userName} to ${location} with ${maxPassengers} max passengers.`
        );
      }
    });
  } else {
    res?.send(`Sorry, ${req.body.text} is not a valid location.`);
  }
}

// Update or create the rider in the data.json file
app.post("/update/rider", async (req, res) => {
  await updateAux(true, req, res);
});

// Update or create the driver in the data.json file
app.post("/update/driver", async (req, res) => {
  await updateAux(false, req, res);
});

// Delete the rider from the data.json file
app.post("/delete/driver", async (req, res) => {
  // Read the data.json file and parse it into a JSON object
  let data = await readData();

  // Delete the driver from the data.json file
  const userId = req.body.user_id;
  const drivers = data.drivers;

  const index = drivers.findIndex((driver) => driver.id === userId);
  if (index === -1) {
    res.send(`Sorry, ${req.body.user_name} is not a valid driver.`);
  } else {
    drivers.splice(index, 1);

    // Write the updated data to the data.json file
    writeData(data);

    res.send(`Successfully deleted: ${req.body.user_name}`);
  }
});

// Fetch the latest version of the data.json file from the server
app.get("/latest_data", async (req, res) => {
  const data = await readData();
  res.send(data);
});

// Shuffle an array
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

// Generate driver-rider assignments
async function generateAssignments(req, res, writeDirectly) {
  let data = await readData();

  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
    params: {
      channel: publishedChannel,
      timestamp: data.ts,
    },
  };

  axios
    .get("https://slack.com/api/reactions.get", config)
    .then((response) => {
      const rxns = response.data.message?.reactions;
      if (!rxns && prod) {
        res.send("No one reacted to the message.");
      } else {
        if (prod) {
          var usersWhoReacted = rxns.map((rxn) => rxn.users).flat();
          var usersWhoReactedUniq = [...new Set(usersWhoReacted)];
        } else {
          var usersWhoReactedUniq = [
            "U01A6CLST1Q",
            "UTPGAGUEN",
            "U02E7BNCET0",
            "UTHCE2TM4",
            "U01CZTPKLPK",
            "U019RFGMB1D",
            "U01BQFS8YA2",
            "U02HRJUPYLU",
            "U038JE95XS4",
            "U03UH8X0PCJ",
            "U02CNNT66AE",
            "U02BSCKMYT1",
            "U03NS41HM5G",
            "U03U2085Q5D",
            "U03U20809GF",
            "U02C9KRF22K",
            "U02CG5M067Q",
            "U02H30L4N5U",
            "UT4144HTK",
            "U03UYFXDZ4H",
          ];
        }

        // Initialize the data structures
        let driverRiderMap = {};
        let driverRiderMap2 = {};
        let ridersWithoutDriver = [];
        let ridersWithoutDriver2 = [];
        let availableDrivers = [];
        for (const driver of data.drivers) {
          if (usersWhoReactedUniq.includes(driver.id)) {
            driverRiderMap[driver.name] = [];
            driverRiderMap2[driver.name] = [];
            availableDrivers.push(driver);
          }
        }
        let noIdealAssignmentExists = false;
        let noOptimalAssignmentExists = false;

        let validRidersWhoReacted = [];
        // Assign riders to drivers - try to match riders' preferred locations
        for (const userId of usersWhoReactedUniq) {
          // Introduce randomness to the assignment process
          shuffle(data.drivers);

          // Find the rider info from the list of users who reacted to the post
          const rider = data.riders.find((rdr) => rdr.id === userId);
          if (rider) {
            // Add the rider to a list of who reacted to the post -- used if the
            // ideal assignment doesn't exist
            validRidersWhoReacted.push(rider);

            // Match the rider to a driver based on capacity and location
            const driver = availableDrivers.find(
              (drv) =>
                drv.location === rider.location &&
                drv.maxPassengers - driverRiderMap[drv.name].length > 0
            );
            // Possible driver was found
            if (driver) {
              driverRiderMap[driver.name].push(rider.name);
            } else {
              // No driver possible
              ridersWithoutDriver.push(rider.name);
              console.log(`No driver found for ${rider.name}`);
            }
          }
        }

        // Redo the assignment process if there are any riders without a driver
        if (ridersWithoutDriver.length > 0) {
          // Try a non-ideal, but still optimal (possible), assignment
          console.log("!!!!!Redoing the assignment process...!!!!!!!");
          noIdealAssignmentExists = true;

          // Sort the riders and drivers by their preferred location
          validRidersWhoReacted = _.sortBy(validRidersWhoReacted, (rdr) =>
            _.indexOf(rideLocations, rdr.location)
          );
          availableDrivers = _.sortBy(availableDrivers, (drv) =>
            _.indexOf(rideLocations, drv.location)
          );

          // Same process as above, but with a twist
          console.log(validRidersWhoReacted);
          for (const rider of validRidersWhoReacted) {
            const driver = availableDrivers.find(
              (drv) =>
                drv.location === rider.location &&
                drv.maxPassengers - driverRiderMap2[drv.name].length > 0
            );
            console.log(`Processing rider: ${rider.name}`);
            if (driver) {
              driverRiderMap2[driver.name].push(rider.name);
              console.log(
                `Assigned rider ${rider.name} to driver: ${driver.name}`
              );
            } else {
              // The twist: find a driver with capacity, but don't care about location
              const driverForAnotherLocation = availableDrivers.find(
                (drv) =>
                  drv.maxPassengers - driverRiderMap2[drv.name].length > 0
              );
              if (driverForAnotherLocation) {
                // Display the new location so the driver knows
                const displayedLoc = (string) =>
                  string.charAt(0).toUpperCase() + string.slice(1);
                driverRiderMap2[driverForAnotherLocation.name].push(
                  `${rider.name} (${displayedLoc(rider.location)})`
                );
                console.log(
                  `Assigned rider ${rider.name} to driver (another location): ${driverForAnotherLocation.name}`
                );
              } else {
                // We're out of luck - not possible to assign this rider
                ridersWithoutDriver2.push(rider.name);
                console.log(`No driver found for ${rider.name}`);
                noOptimalAssignmentExists = true;
              }
            }
          }
        }

        // Display the results in string format
        let assignments2;
        let assignments2Str = "";
        if (noOptimalAssignmentExists) {
          // Send both assignments as options
          assignments2 = Object.entries(driverRiderMap2).map(
            ([driver, riders]) => {
              return `${driver} => ${riders.join(", ")}`;
            }
          );
          assignments2Str = `${assignments2.join(
            "\n"
          )}\n\nUnassigned riders:\n${ridersWithoutDriver2.join("\n")}`;
        }

        const assignments = Object.entries(
          noIdealAssignmentExists && !noOptimalAssignmentExists
            ? driverRiderMap2
            : driverRiderMap
        ).map(([driver, riders]) => {
          return `${driver} => ${riders.join(", ")}`;
        });
        const assignmentsStr = `${
          noOptimalAssignmentExists
            ? "There's no way to generate an optimal assignment of drivers to riders. I generated two possibilities though, feel free to modify as needed and post manually.\nOption 1:\n"
            : ""
        }${assignments.join("\n")}\n\nUnassigned riders:\n${
          noIdealAssignmentExists && !noOptimalAssignmentExists
            ? ridersWithoutDriver2
            : ridersWithoutDriver.join("\n")
        }${
          noOptimalAssignmentExists ? "\n\nOption 2:\n" : ""
        }${assignments2Str}`;

        // Send the assignments to the user but without posting publicly
        if (noOptimalAssignmentExists) {
          res.send(assignmentsStr);
        } else {
          res.send(`Successfully generated assignments!\n${assignmentsStr}`);
          // Write the message to the Slack channel
          if (writeDirectly) {
            const config = {
              headers: { Authorization: `Bearer ${botToken}` },
            };
            const message = {
              channel: publishedChannel,
              text: assignmentsStr,
            };
            axios.post(
              "https://slack.com/api/chat.postMessage",
              message,
              config
            );
          }
        }
      }
    })
    .catch((error) => {
      console.log(error);
    });
}

app.get("/generate_assignments", async (req, res) => {
  await generateAssignments(req, res, true);
});

app.post("/generate_assignments", async (req, res) => {
  await generateAssignments(req, res, req.body.text);
});

// Maps emojis to rider locations
function emojiToLocation(emoji) {
  switch (emoji) {
    case "arrow_up":
      return "north";
    case "arrow_down":
      return "collegetown";
    case "arrow_left":
      return "west";
    case "awesome":
      return "williams";
    default:
      return "north";
  }
}

// Slack Events API handler
app.post("/events", async (req, res) => {
  console.log(req);
  res.send(req.body.challenge);
  res.end();

  let data;
  switch (req.body.type) {
    case "reaction_added":
      console.log("Reaction was added, checking timestamp of the message");
      data = await readData();

      if (data.location_ts === req.body.event_ts) {
        console.log("Timestamp matched, updating location");

        // Create a new body for the internal update rider request
        newReq = {
          body: {
            user_id: req.body.user,
            text: emojiToLocation(req.body.reaction),
          },
        };

        // Update the rider's location
        await updateAux(true, newReq, undefined);

        console.log(
          `Updated rider location to ${emojiToLocation(req.body.reaction)}`
        );
      }
      break;
    default:
      break;
  }
});

// Send a test message to the channel
app.get("/send/test/:text", (req, res) => {
  const message = {
    channel: publishedChannel,
    text: req.params.text,
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

// Send the daily reminder announcement to the Slack channel
async function sendDailyReminderMessage(req, res) {
  // Compute tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow
    .toLocaleDateString()
    .split("/")
    .slice(0, 2)
    .join("/");

  const message = {
    channel: publishedChannel,
    text: `<!channel> If you would like a ride to EMP tmrw (${tomorrowStr}), please react to this message :) beep boop`,
  };
  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
  };

  axios.post("https://slack.com/api/chat.postMessage", message, config).then(
    async (messageRes) => {
      res.send(messageRes.data.ts);
      console.log(messageRes.data.ts);

      let data = await readData();
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
app.get("/send/daily", async (req, res) => {
  await sendDailyReminderMessage(req, res);
});

// POST version is used for the slash command on Slack
app.post("/send/daily", async (req, res) => {
  await sendDailyReminderMessage(req, res);
});

app.listen(port, () => {
  console.log(`PrayeRS listening on port ${port}`);
});
