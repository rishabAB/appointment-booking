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
    insurance_plan_type,
  } = parameters;

  const newPatient = {
    name: name,
    email: email,
    dateOfBirth: dob,
    appointmentType: appointment_type,
    insuranceCompany: insurance_company,
    insurancePlanType: insurance_plan_type,
  };

  const response = await connection.db
    ?.collection("patients")
    .insertOne(newPatient);
  
  if (response?.acknowledged) {
    console.log("yes patient saved");
    res.status(201);
  } else {
    console.log("Something went wrong");
    res.status(500);
  }

  }

  catch(error)
  {
    console.error(error);
    res.status(500);
  }
  
});

function formatDate(isoString: string): string {
  const date: Date = new Date(isoString);

  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };

  return date.toLocaleString("en-US", options);
}

app.post("/appointmentRequest",async (req: Request, res: Response) =>
{
   let pageId :string = "9e37c34b-9307-40d1-9f45-8f97b3ff70f5";
   let isAppointmentBooked:boolean = false;
  try{
    // Need to add validations as well for the parameters I am receiving and for the appointment type as well.
    const parameters = req.body?.sessionInfo?.parameters || {};
    console.log("apppointment details", parameters);
    let webhookResponse: string;
    
   
    const {day,hours,minutes,month,year} = parameters?.appointment_time;
    const appointment_type = parameters?.appointment_type;
   
    // ----------------------------------------------
    
    // Convert to JavaScript Date (month - 1 because JavaScript months are 0-based)
    const appointmentDate = new Date(
      year,
      month -1 , 
      day,
      hours,
      minutes,
    );
    let appointmentISO = appointmentDate.toISOString();
    
  
    // -------------------------------------------------
    const existingAppointment = await connection.db
    ?.collection("appointment")
    .findOne({ date_time:appointmentISO,type:appointment_type });

  
     if (existingAppointment) {
      console.log("This time slot is already booked!");
      webhookResponse = "This slot has already been booked.";
      const responsePayload = {
        fulfillment_response: {
          messages: [{ text: { text: [webhookResponse] } }],
        },
        sessionInfo: {
          parameters: {
            isAppointmentBooked:false
          }
        }
      };
      res.json(responsePayload);
      
    } else {
      console.log("Time slot is available!");
  
      let newAppointment = {
        date_time:appointmentISO,
        type:appointment_type
      }
  
      const response = await connection.db
      ?.collection("appointment")
      .insertOne(newAppointment);
    
    if (response?.acknowledged) {
      console.log("Appointment booked");
      isAppointmentBooked = true;
      webhookResponse = "Your appointment has been booked"; // Need to mention the date and appointment type
      const responsePayload = {
    
        fulfillment_response: {
          messages: [{ text: { text: [webhookResponse] } }],
        },
        sessionInfo:{
          parameters:{
            appointmentDateTime:formatDate(appointmentISO),
            type:appointment_type,
            isAppointmentBooked:isAppointmentBooked
          }
        }
      }; 
      res.json(responsePayload);  
      
    } else {
      console.error("Something went wrong",response);
      webhookResponse = "Something went wrong!! Please try again";  
      const responsePayload = {
      
        fulfillment_response: {
          messages: [{ text: { text: [webhookResponse] } }],
        },
        sessionInfo: {
          parameters: {
            isAppointmentBooked:isAppointmentBooked
          }
        }
      }; 
      res.json(responsePayload);   
    }
  
   
    }
  
  }
  catch(error)
  {
    console.error(error);
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: ["An Error occurred,Please try again !!"] } }],
      },
      sessionInfo: {
        parameters: {
          isAppointmentBooked:isAppointmentBooked
        }
      }
    };
    res.json(responsePayload);
    
  }


  // --------------------------------------------
 
  // here I need to in the appointments collections 
  //whether it is available or not then accordingly send the response


})

app.post("/webhook", async (req: Request, res: Response) => {
  try {
    // Extract session parameters
    const parameters = req.body?.sessionInfo?.parameters || {};
    let webhookResponse: string;

    const {  email } = parameters;

    // ----------------------------------------
    const emailExixts = await connection.db
      ?.collection("patients")
      .findOne({ email });
    if (!emailExixts) {
      webhookResponse =
        "Please provide your insurance provider name and plan type.";

    } else {
      webhookResponse =
        "Please tell when you want to book an appointment and your appointment type.";
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
  const { firstName, lastName, email, dateOfBirth } = req.body;
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
