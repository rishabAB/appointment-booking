/* Setting up the server using express and its's types*/
import express, { Request, response, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { InsertOneResult } from "mongodb";
import { ErrorRequestHandler } from "express";
import { WebhookClient } from "dialogflow-fulfillment";
const app = express();
const uri: string =
  process.env.ATLAS_URI ||
  "mongodb+srv://rishab:Iamrm123@cluster0.qq0dajb.mongodb.net/chatApplication?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.json());
app.use(cors());
const port: number = 4000;
let connection: mongoose.Connection;

app.post("/insurance", async (req: Request, res: Response) => {
  try{
    const parameters = req.body?.sessionInfo?.parameters || {};
  console.log("Insuracne details", parameters);

  const {
    name,
    email,
    dob,
    appointment_type,
    insurance_company,
    insurance_play_type,
  } = parameters;

  const newPatient = {
    name: name,
    email: email,
    dateOfBirth: dob,
    appointmentType: appointment_type,
    insuranceCompany: insurance_company,
    insurancePlanType: insurance_play_type,
  };

  const response = await connection.db
    ?.collection("patients")
    .insertOne(newPatient);
  // pageId ="2ae928ad-26af-4132-841c-071b4da1b498";
  if (response?.acknowledged) {
    console.log("yes patient saved");
  } else {
    console.log("Something went wrong");
  }

  // const responsePayload = {
  //   fulfillment_response: {
  //     messages: [{ text: { text: [webhookResponse] } }],
  //   },
  //   // sessionInfo: {
  //   //   // parameters: {
  //   //   //   receivedFirstName: parameters.firstName || "Unknown",
  //   //   //   receivedLastName: parameters.lastName || "Unknown",
  //   //   // },
  //   //   currentPage: `projects/voice-agent-using-dialogflow/locations/global/agents/1083e531-abdf-43c7-a801-6ff8e9c65355/flows/00000000-0000-0000-0000-000000000000/pages/${pageId}`
  //   // }
  // };
  res.status(201);

  }

  catch(error)
  {
    console.error(error);
    res.status(500);
  }
  
});

app.post("/appointmentRequest",async (req: Request, res: Response) =>
{
  const parameters = req.body?.sessionInfo?.parameters || {};
  console.log("Insuracne details", parameters);
  // here I need to in the appointments collections 
  //whether it is available or not then accordingly send the response
  res.status(200);

})

app.post("/webhook", async (req: Request, res: Response) => {
  try {
    // Extract session parameters
    const parameters = req.body?.sessionInfo?.parameters || {};
    let webhookResponse: string;
    let pageId: string;

    const { name, email, dob, appointment_type } = parameters;

    console.log("Check if email exists in ", parameters);

    // ----------------------------------------
    const emailExixts = await connection.db
      ?.collection("patients")
      .findOne({ email });
    if (!emailExixts) {
      webhookResponse =
        "Please provide your insurance provider name and plan type.";

      // const newPatient = {
      //     name: name,
      //     email: email,
      //     dateOfBirth:dob,
      //     appointmentType: appointment_type
      //   };

      // const response = await connection.db?.collection('patients').insertOne(newPatient);
      // // pageId ="2ae928ad-26af-4132-841c-071b4da1b498";
      // if(response?.acknowledged)
      // {
      //   console.log("yes patient saved");
      // }
      // else{
      //   console.log("Something went wrong");
      // }
      console.log(response);
      // Ask for more details like contact number and insurance
    } else {
      webhookResponse =
        "Please tell me when you want to book an appointment and your appointment type.";
      pageId = "";
    }
    // ---------------------------------

    // Construct response
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [webhookResponse] } }],
      },
      // sessionInfo: {
      //   // parameters: {
      //   //   receivedFirstName: parameters.firstName || "Unknown",
      //   //   receivedLastName: parameters.lastName || "Unknown",
      //   // },
      //   currentPage: `projects/voice-agent-using-dialogflow/locations/global/agents/1083e531-abdf-43c7-a801-6ff8e9c65355/flows/00000000-0000-0000-0000-000000000000/pages/${pageId}`
      // }
    };

    res.json(responsePayload);
  } catch (error) {
    console.error(error);
  }
});

app.post("/", async (req: Request, res: Response) => {
  // assuming we are getting these details directly through postman and all these fields should be mandatory
  const { firstName, lastName, email, dateOfBirth, appointmentType } = req.body;
  // Email should be mandatory
  if (!email) {
    res.status(400);
  } else {
    // Checking if patient exists using email(should be unique)
    const emailExixts = await connection.db
      ?.collection("patients")
      .findOne({ email });
    if (!emailExixts) {
      const newPatient = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        dateOfBirth: dateOfBirth,
        appointmentType: appointmentType,
      };

      const response = await connection.db
        ?.collection("patients")
        .insertOne(newPatient);
      if (response?.acknowledged) {
        console.log("yes patient saved");
      }
      console.log(response);
    } else {
    }

    res.send("Welcome to the Express.js Tutorial");
  }
});

// Starting the server
app.listen(port, () => {
  console.log(uri);
  console.log(`Server is running on localhost:${port}`);
});

async function insertDataInPatientCollection() {
  const newPatient = {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    appointmentType: "Checkup",
  };
  const result = await connection.db
    ?.collection("patients")
    .insertOne(newPatient);
  console.log("Result is ", result);
}

function connectToDatabase() {
  mongoose
    .connect(uri, {})
    .then(() => {
      connection = mongoose.connection;
      console.log("Mongodb connection successful", connection);

      //  insertDataInPatientCollection();
    })
    .catch((error: ErrorRequestHandler) => {
      console.error("Mongodb connection failed", error);
      process.exit(); // Exiting our server beacause of an error in mongo db connection
    });
}
connectToDatabase();
