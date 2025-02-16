/* Setting up the server using express and its's types*/
import express, { Request, response, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { InsertOneResult } from "mongodb";
import { ErrorRequestHandler } from "express";
import { WebhookClient } from "dialogflow-fulfillment";
import { ObjectId, Collection } from "mongodb";
import { rejects } from "assert";
const app = express();
const uri: string =
  process.env.ATLAS_URI ||
  "";
let emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
let patientIdRegex = /^[a-fA-F0-9]{24}$/;

app.use(express.json());
app.use(cors());
const port: number = 4000;
let connection: mongoose.Connection;

function validateDOB(dob: any): boolean {

  // ---
  const {year,month,day} = dob;
  const dobDate = new Date(
    year,
    month -1 , 
    day,
  
  );
  console.log("Dob date",dobDate);

  // -----
  // const dobDate = new Date(dob);
  const today = new Date();
  
  // Remove time portion for an accurate date comparison
  today.setHours(0, 0, 0, 0);
  const newYorkTime = new Date(today.toLocaleString("en-US", { timeZone: "America/New_York" }));
  newYorkTime.setHours(0,0,0,0);

  return dobDate <= newYorkTime; // DOB should not be greater than today
}
app.post("/validateDob", async (req: Request, res: Response) =>
{
  try{
    let {dob} = req?.body?.sessionInfo?.parameters;
    if (!validateDOB(dob)) {
      const responsePayload = {
        fulfillment_response: {
          messages: [{ text: { text: ["Invalid Date of Birth."] } }],
        },
        sessionInfo: {
          parameters: {
            dob: null, // Clear incorrect input
          },
        },
      }
      res.json(responsePayload);
    }

  }
  catch(error)
  {
    console.error(error);
    res.send(500);

  }
})

function getValidIdentifier(string : string) : Promise<string | null>
{
  return new Promise((resolve,_reject) =>
  {
    const arrayOfString: string[] = string.split(" ");
    const match = arrayOfString.find((elem :string) => emailRegex.test(elem) || patientIdRegex.test(elem));
    resolve(match || null);

  })
}

async function findUser(identifier: string, collection: Collection): Promise<any | null> {
  let query;

  if (ObjectId.isValid(identifier)) {
    query = { $or: [{ _id: new ObjectId(identifier) }, { email: identifier }] };
  } else {
    query = { email: identifier };
  }

  return await collection.findOne(query);
}
app.post("/getExistingPatient", async (req: Request, res: Response) =>
{
 
  try{
    console.log(req?.body?.sessionInfo?.parameters);
  
    let {patient_id_or_email} = req?.body?.sessionInfo?.parameters;
    let webhookResponse:string = "";
    let isPatientIdentified:boolean = false;
  
    const match = await getValidIdentifier(patient_id_or_email);
    if(!match)
    {
      webhookResponse= "This email address or patient id in invalid.";
      patient_id_or_email = null;
    }
    else{
      if (!connection?.db) {
        throw new Error("Database connection is not established.");
      }
      
      const collection = connection.db.collection("patients");
      const user = await findUser(match, collection);
      console.log("User is ",user);
      if(!user)
      {
        webhookResponse="This email address or patient id does not exist.";
        patient_id_or_email = null;
      }
      else{
        isPatientIdentified = true;
        webhookResponse = `Hii ${user?.first_name ? user?.first_name : user?.name}`; // I need to change it first name only 
      }

  
    }
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [webhookResponse] } }],
      },
      sessionInfo: {
        parameters: {
          isPatientIdentified:isPatientIdentified,
          patient_id_or_email:patient_id_or_email
        }
      }
    };
    res.json(responsePayload);
    
  }
  catch(error)
  {
    console.error(error);
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: ["An unknown Error occurred,Please try again !!"] } }],
      },
      sessionInfo: {
        parameters: {
          isPatientIdentified:false
        }
      }
    };
    res.json(responsePayload);
   
  }

})


function extractInsuranceName(inputString : String) {
  const regex = /\b(?:health insurance provider is|it's|provider is|insurance is | my health insurance provider is | my insurance provider is | my health provider is )\s+([\w\s-]+)/i;
    const match = inputString.match(regex);
  //   console.log(match)
    return match ? match[1] : inputString; 
  }

  function extractInsuranceType(inputString : String) {
    const regex = /\b(?:health insurance type is|it's|insurance type is|type is|my health insurance type is |okay,type is | okay it is)\s+([\w\s-]+)/i;
      const match = inputString.match(regex);
    //   console.log(match)
      return match ? match[1] : inputString; 
    }

  
app.post("/insurance", async (req: Request, res: Response) => {
  try{
    // Here I need to format dob,insurance both name and type and then insert it and provide patient Id to the patient
    const parameters = req.body?.sessionInfo?.parameters || {};
    let webhookResponse:string = "";
    let isPatientCreated:boolean = false;
  console.log("Insuracne details", parameters);


  let {
    first_name,
    last_name,
    email,
    dob,
    insurance_name,
    insurance_type,
  } = parameters;

  const {year,month,day} = dob;
  insurance_name = extractInsuranceName(insurance_name);
  insurance_type = extractInsuranceType(insurance_type);

  const newPatient = {
    first_name: first_name,
    last_name:last_name,
    email: email,
    dateOfBirth: `${day}/${month}/${year}`,
    insuranceCompany: insurance_name,
    insurancePlanType: insurance_type,
  };

  const response = await connection.db
    ?.collection("patients")
    .insertOne(newPatient);
    
  
  if (response?.acknowledged) {
    const patientId = response?.insertedId.toString();
    webhookResponse = `Your unique Patient ID is ${patientId}. Please save it for future use or your email address would also work`;
    console.log("yes patient saved");
    isPatientCreated = true;
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [webhookResponse] } }],
      },
      sessionInfo: {
        parameters: {
          insurance_name:insurance_name,
          insurance_type:insurance_type,
          isPatientCreated:isPatientCreated
        }
      }
    };
    res.json(responsePayload);
  
  } else {
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: ["An Error occurred.Please Try again !!"] } }],
      },
      sessionInfo: {
        parameters: {
          isPatientCreated:isPatientCreated
        }
      }
    };
    res.json(responsePayload);
  
  }

  }

  catch(error)
  {
    console.error(error);
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: ["An Error occurred.Please Try again !!"] } }],
      },
      sessionInfo: {
        parameters: {
          isPatientCreated:false
        }
      }
    };
    res.json(responsePayload);
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

function isTimeSlotValid(minutes: number, hours: number, day: number, month: number, year: number): any {
  // Create the date object (local time)
  if(minutes == undefined || hours == undefined || day == undefined || month == undefined || year == undefined)
  {
    return {isValid:false,message:"Incorrect time slot provided"};
  }
  // Also need to check whether date is of past or not if past then incorrecrt time slot 
  
  const appointmentDate = new Date(year, month -1 , day, hours, minutes);

  // Convert to New York timezone
  const newYorkTime = new Date(appointmentDate.toLocaleString("en-US", { timeZone: "America/New_York" }));

  // Extract the day of the week (0 = Sunday, 6 = Saturday)
  const dayOfWeek = appointmentDate.getDay(); 

  // Extract hours and minutes in New York time
  const nyHours = appointmentDate.getHours();
  
  // Check if it's Sunday
  if (dayOfWeek === 0) {
    return {isValid:false,message:"We don't work on sundays"};
  }

  // Check if time is outside 9 AM - 7 PM
  if (nyHours < 9 || nyHours >= 19) {
    return {isValid:false,message:"We operate from 9am to 7pm"};
  }

  // Check if time is between 1 PM - 2 PM (don't include 2 PM)
  if (nyHours === 13) {
    return {isValid:false,message:"It's our lunch time"};
  }

  return {isValid:true,message:null};
}

 function getPatientId(patient_id_or_email : string) : Promise<string | undefined>
{
  return new Promise(async(resolve,reject) =>
  {
    const elem =patientIdRegex.test(patient_id_or_email);
    if(elem)
    {
      resolve(patient_id_or_email);
    }
    else{
      const response = await connection.db
      ?.collection("patients")
      .findOne({ email:patient_id_or_email });
      resolve(response?._id?.toString());
    }

  })

}

function getNearestAppointmentSlot(existingAppointment: any,appointment_type :String)  : Promise<any>
{
  return new Promise(async(resolve,reject) =>
  {
    // const existingAppointment = await connection.db
    //   ?.collection("appointment")
    //   .findOne({
    //     type: appointment_type, // Ensure the appointment type matches
    //     startTime: { $lte: desiredAppointmentSlot }, // startTime should be before or equal to the desired time
    //     endTime: { $gt: desiredAppointmentSlot },   // endTime should be after the desired time
    //   });
    let returnObject={isFound:false as Boolean,beforeDesiredDate:null as Date | null,afterDesiredDate : null as Date | null,message:""}
    const beforeDesiredSlot = await recursiveAppointmentSlot(existingAppointment.startTime,appointment_type,"BEFORE");
    const afterDesiredSlot = await recursiveAppointmentSlot(existingAppointment.endTime,appointment_type,"AFTER");
    if(!beforeDesiredSlot && !afterDesiredSlot)
    {
      returnObject.message = "No date available for the desired date";
    }
    else if(beforeDesiredSlot && afterDesiredSlot){
      returnObject.isFound = true;
      returnObject.beforeDesiredDate = beforeDesiredSlot;
      returnObject.afterDesiredDate = afterDesiredSlot;
    }
    else if(beforeDesiredSlot && !afterDesiredSlot)
    {
      returnObject.isFound = true;
      returnObject.beforeDesiredDate = beforeDesiredSlot;
      returnObject.message="Only Before Desired Slot";
    
    }
    else{
      returnObject.isFound = true;
      returnObject.afterDesiredDate = afterDesiredSlot;
      returnObject.message="Only After Desired Slot";

    }
    resolve(returnObject);

  })
 
}

async function recursiveAppointmentSlot(alreadyBooked: Date,appointment_type :String, beforeOrAfterDesired :String) 
{
  // return new Promise((async (resolve,reject) =>
  // {

    // Base case
     let hours = alreadyBooked.getHours();
    console.log("Current hours",hours);
    if(hours < 9  || hours >= 19 || hours === 13)
    {
      // resolve(null);
      return null;
    }
    else{
      // --  const appointmentDate = new Date(year, month -1 , day, hours, minutes);
      // let desiredAppointmentSlot:Date = new Date(year, month  , day, hours, minutes);
      let cloneDate : Date = new Date(alreadyBooked);
     
      beforeOrAfterDesired === "BEFORE" ?  cloneDate.setMinutes(alreadyBooked.getMinutes() - 45) :  cloneDate.setMinutes(alreadyBooked.getMinutes() + 45);
   
      const existingAppointment = await connection.db
      ?.collection("appointment")
      .findOne({
        type: appointment_type, // Ensure the appointment type matches
        startTime: { $lte: cloneDate }, // startTime should be before or equal to the desired time
        endTime: { $gt: alreadyBooked },   // endTime should be after the desired time
      });
      if(existingAppointment)
      {
        if(beforeOrAfterDesired === "BEFORE")
        {
          // resolve(recursiveAppointmentSlot(existingAppointment.startTime,appointment_type,beforeOrAfterDesired));
          return  (recursiveAppointmentSlot(existingAppointment.startTime,appointment_type,beforeOrAfterDesired));
        }
        else{
          // resolve(recursiveAppointmentSlot(existingAppointment.endTime,appointment_type,beforeOrAfterDesired));
          return(recursiveAppointmentSlot(existingAppointment.endTime,appointment_type,beforeOrAfterDesired));
        }
       
      }
      else{
        // resolve(cloneDate);
        return cloneDate;
      }

    }
  

  // }))
}

// Presumed conditions
/* Appointment cannot get scheduled on sundays, timings are 9 am to 7pm , 1pm to 2pm break time , by default I am assuming 
appointment slot is 30 minutes to 45 minutes so a person says 3pm then it should end at 3:45pm, also 
I am assuming that appointment is based on doctor type like for cardiologist there is 1 doctor for dentist there is 1 doctor like that  */

app.post("/appointmentRequest",async (req: Request, res: Response) =>
{
  try{
    let pageId :string = "9e37c34b-9307-40d1-9f45-8f97b3ff70f5";
    let webhookResponse: string = "";
    let isAppointmentBooked:boolean = false;
    // Need to add validations as well for the parameters I am receiving and for the appointment type as well.
    const parameters = req.body?.sessionInfo?.parameters || {};
    console.log("apppointment details", parameters);
   
    
   
    const {day,hours,minutes,month,year} = parameters?.appointment_time;
  
    const appointment_type = parameters?.appointment_type;
   
    // ----------------------------------------------
    
    // Convert to JavaScript Date (month - 1 because JavaScript months are 0-based)
 
    const isTimeValid = isTimeSlotValid(minutes,hours,day,month,year);
    console.log("isTimeValid",isTimeValid);
    if(!isTimeValid.isValid)
    {
      webhookResponse = isTimeValid.message;
    }
    else{
      const desiredAppointmentSlot = new Date(
        year,
        month -1  , 
        day,
        hours,
        minutes,
      );
      let appointmentISO = desiredAppointmentSlot.toISOString();
    
  
      // -------------------------------------------------
      const existingAppointment = await connection.db
      ?.collection("appointment")
      .findOne({
        type: appointment_type, // Ensure the appointment type matches
        startTime: { $lte: desiredAppointmentSlot }, // startTime should be before or equal to the desired time
        endTime: { $gt: desiredAppointmentSlot },   // endTime should be after the desired time
      });
  
    
       if (existingAppointment) {
        console.log("This time slot is already booked!");
        webhookResponse = "This slot has already been booked.";
        const nearestAppointmentSlot :any = getNearestAppointmentSlot(existingAppointment,appointment_type);
        const responsePayload = {
          fulfillment_response: {
            messages: [{ text: { text: [webhookResponse] } }],
          },
          sessionInfo: {
            parameters: {
              isAppointmentBooked:false,
              appointment_time:null
            }
          }
        };
        res.json(responsePayload);
        
      } else {
        console.log("Time slot is available!");
        let endTime:Date = new Date( year,
          month -1  , 
          day,
          hours,
          minutes+45)

          const patientId = await getPatientId(parameters?.patient_id_or_email);
          if(!patientId)
          {
            webhookResponse = "An unknown Error occured,Please try again !!";
          }
          else{
            let newAppointment:object = {
              startTime:desiredAppointmentSlot,
              endTime:endTime,
              type:appointment_type,
              patientId:patientId
            }

            // ----Test chat gpt --
          //   const existingAppointment = await connection.db
          //   ?.collection("appointment")
          //   .findOne({
          //     type: appointment_type, // Ensure the appointment type matches
          //     startTime: { $lte: desiredAppointmentSlot }, // startTime should be before or equal to the desired time
          //     endTime: { $gt: desiredAppointmentSlot },   // endTime should be after the desired time
          //   });
          
          // if (existingAppointment) {
          //   console.log("Slot is already booked.");
          // } else {
          //   console.log("Slot is available.");
          // }
            // -----
    
           
            // create a function to find patientId using email 'patient_id_or_email'
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

    }

    // ----
    // const responsePayload = {
          
    //   fulfillment_response: {
    //     messages: [{ text: { text: [webhookResponse] } }],
    //   },
    //   sessionInfo:{
    //     parameters:{
    //       // appointmentDateTime:formatDate(appointmentISO),
    //       type:appointment_type,
    //       isAppointmentBooked:isAppointmentBooked
    //     }
    //   }
    // }; 
    // res.json(responsePayload);  

    // ----
  
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
          isAppointmentBooked:false
        }
      }
    };
    res.json(responsePayload);
    
  }


  // --------------------------------------------
 
  // here I need to in the appointments collections 
  //whether it is available or not then accordingly send the response


})

function validatePatientDetails(body: { first_name: any; last_name: any; dob: any; email: any; })
{
  let response={
    isActionSuccess:false,
    error:null
  }
  const {first_name,last_name,dob,email} = body;
  if(!first_name || !last_name || !last_name || !email)
  {


  }

}

function extractLastName(inputString : String) {
  const regex = /\b(?:lastname is|it's|surname is|my last name is|okay last name is)\s+(\w+)/i;
    const match = inputString.match(regex);
  //   console.log(match)
    return match ? match[1] : inputString; // Return the first name or null if not found
  }
  
  
  function extractFirstName(inputString : String) {
  const regex = (/\b(?:firstname is|it's|name is|my name is|okay firstname is | my firstname is )\s+(\w+)/i);
    const match = inputString.match(regex);
  //   console.log(match)
    return match ? match[1] : inputString; // Return the first name or null if not found
  }

  function extractEmail(inputString : String) {
    // const regex = (/\b(?:firstname is|it's|name is|my name is|okay firstname is | my firstname is )\s+(\w+)/i);
    const arrayOfString: string[] = inputString.split(" ");
    const match = arrayOfString.find((elem :string) => emailRegex.test(elem));
    return match ? match : null;
     
    }


app.post("/sendDetails", async (req: Request, res: Response) => {
  try {
    // Extract session parameters
    const parameters = req.body?.sessionInfo?.parameters;
    let webhookResponse: string = "";
    let isAlreadyRegistered :boolean = false;
   
    let { email,first_name,last_name } = parameters;
    console.log("Webhook parameters are ",parameters);
    first_name = extractFirstName(first_name);
    last_name = extractLastName(last_name);
     email = extractEmail(email);

    // ----------------------------------------
    const emailExixts = await connection.db
      ?.collection("patients")
      .findOne({ email });
    if (emailExixts) {
      webhookResponse =
      `hii  ${emailExixts?.name},It looks like you have already registered`;
      isAlreadyRegistered = true;
    } 
    // ---------------------------------

    // Construct response
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [webhookResponse] } }],
      },
      sessionInfo: {
        parameters: {
          first_name: first_name,
          last_name: last_name,
          email:email,
          isAlreadyRegistered:isAlreadyRegistered,
          insurance_type:emailExixts?.insurancePlanType? emailExixts.insurancePlanType : null,
          insurance_name:emailExixts?.insuranceCompany ? emailExixts.insuranceCompany : null
        },
        // currentPage: `projects/voice-agent-using-dialogflow/locations/global/agents/1083e531-abdf-43c7-a801-6ff8e9c65355/flows/00000000-0000-0000-0000-000000000000/pages/${pageId}`
      }
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
