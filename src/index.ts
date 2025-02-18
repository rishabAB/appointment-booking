import express, { Request, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { ErrorRequestHandler } from "express";
import { ERROR_MESSAGES, EXTRACT_DETAILS_KEYS } from "./constants";
import {
  validateDOB,
  findUser,
  formatDate,
  isTimeSlotValid,
  extractDetails,
  formatHumanReadableTime,
  formatHumanReadableDate,
} from "./helpers";

const app = express();
const uri: string = process.env.STEER_HEALTH_DB || "";

app.use(express.json());
app.use(cors());
const port: number = 4000;
let connection: mongoose.Connection;

/**This route is being used in order to validate date of birth */
app.post("/validateDob", async (req: Request, res: Response) => {
  try {
    let { dob } = req?.body?.sessionInfo?.parameters;
    if (!validateDOB(dob)) {
      const responsePayload = {
        fulfillment_response: {
          messages: [{ text: { text: ["Invalid Date of Birth."] } }],
        },
        sessionInfo: {
          parameters: {
            dob: null, // Clearing incorrect input
          },
        },
      };
      res.json(responsePayload);
    }
  } catch (error) {
    console.error(error);
    res.send(500);
  }
});

/**We are fetching existing patient details if patient says he/she has been before */
app.post("/getExistingPatient", async (req: Request, res: Response) => {
  try {
    let { patient_id } = req?.body?.sessionInfo?.parameters;
    let webhookResponse: string = "";
    let isPatientIdentified: boolean = false;

    if (!connection?.db) {
      throw new Error("Database connection is not established.");
    }

    const collection = connection.db.collection("patients");
    const user = await findUser(patient_id, collection);

    if (!user) {
      webhookResponse = "This patient id does not match with our records.";
      patient_id = null;
    } else {
      isPatientIdentified = true;
      webhookResponse = `Hii ${user?.firstName}`;
    }
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [webhookResponse] } }],
      },
      sessionInfo: {
        parameters: {
          isPatientIdentified: isPatientIdentified,
          patient_id: patient_id,
        },
      },
    };
    res.json(responsePayload);
  } catch (error) {
    console.error(error);
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [ERROR_MESSAGES.defaultMessage] } }],
      },
      sessionInfo: {
        parameters: {
          isPatientIdentified: false,
        },
      },
    };
    res.json(responsePayload);
  }
});

/** We are getting auto incremented id from patients collection */
async function autoIncrementedId() {
  return new Promise(async (resolve, reject) => {
    try {
      var lastPatient = await connection.db
        ?.collection("patients")
        .find()
        .sort({ id: -1 })
        .limit(1)
        .toArray();
      let id;

      if (lastPatient?.length) {
        // If there is a result, increment the last id
        id = lastPatient[0].id + 1;
      } else {
        // If no result, start from id 1
        id = 1;
      }
      resolve(id);
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
}

/**We are inserting new patient details in our database */
app.post("/createPatient", async (req: Request, res: Response) => {
  try {
    const parameters = req.body?.sessionInfo?.parameters || {};
    let webhookResponse: string = "";
    let isPatientCreated: boolean = false;

    let { firstname, lastname, dob, insurance_name, insurance_type } =
      parameters;

    const { year, month, day } = dob;

    insurance_name = extractDetails(
      insurance_name,
      EXTRACT_DETAILS_KEYS.insuranceName
    );
    insurance_type = extractDetails(
      insurance_type,
      EXTRACT_DETAILS_KEYS.insuranceType
    );
    const patientId = await autoIncrementedId();

    const newPatient = {
      firstName: firstname,
      lastName: lastname,
      dateOfBirth: `${day}/${month}/${year}`,
      insuranceCompany: insurance_name,
      insurancePlanType: insurance_type,
      id: patientId,
    };

    const response = await connection.db
      ?.collection("patients")
      .insertOne(newPatient);

    if (response?.acknowledged) {
      /**Providing the patient id for future references */
      webhookResponse = `Your unique Patient ID is ${patientId}. Please save it for future use.`;

      isPatientCreated = true;
      const responsePayload = {
        fulfillment_response: {
          messages: [{ text: { text: [webhookResponse] } }],
        },
        sessionInfo: {
          parameters: {
            insurance_name: insurance_name,
            insurance_type: insurance_type,
            isPatientCreated: isPatientCreated,
            patient_id: patientId,
          },
        },
      };
      res.json(responsePayload);
    } else {
      const responsePayload = {
        fulfillment_response: {
          messages: [{ text: { text: [ERROR_MESSAGES.defaultMessage] } }],
        },
        sessionInfo: {
          parameters: {
            isPatientCreated: isPatientCreated,
          },
        },
      };
      res.json(responsePayload);
    }
  } catch (error) {
    console.error(error);
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [ERROR_MESSAGES.defaultMessage] } }],
      },
      sessionInfo: {
        parameters: {
          isPatientCreated: false,
        },
      },
    };
    res.json(responsePayload);
  }
});

/**@param existingAppointment, @param appointment_type*/
/**We are trying to get before appointment slot and after if the desired slot is already booked */
function getNearestAppointmentSlot(
  existingAppointment: any,
  appointment_type: String
): Promise<any> {
  return new Promise(async (resolve, reject) => {
    let returnObject = {
      isFound: true as Boolean,
      beforeDesiredDate: null as Date | null,
      afterDesiredDate: null as Date | null,
      message: "",
    };
    const beforeDesiredSlot = await recursiveAppointmentSlot(
      existingAppointment.startTime,
      appointment_type,
      "BEFORE",
      false
    );
    const afterDesiredSlot = await recursiveAppointmentSlot(
      existingAppointment.endTime,
      appointment_type,
      "AFTER",
      false
    );
    if (!beforeDesiredSlot && !afterDesiredSlot) {
      returnObject.isFound = false;
      returnObject.message = "No date available for the desired date";
    } else if (beforeDesiredSlot && afterDesiredSlot) {
      returnObject.beforeDesiredDate = beforeDesiredSlot;
      returnObject.afterDesiredDate = afterDesiredSlot;
    } else if (beforeDesiredSlot && !afterDesiredSlot) {
      returnObject.beforeDesiredDate = beforeDesiredSlot;
      returnObject.message = "Only Before Desired Slot";
    } else {
      returnObject.afterDesiredDate = afterDesiredSlot;
      returnObject.message = "Only After Desired Slot";
    }
    resolve(returnObject);
  });
}

/**@param alreadyBooked, @param appointment_type , @param beforeOrAfterDesired , @param isBreakTime*/
/**In this function we are trying to get an available time slot for the desired appointment*/
async function recursiveAppointmentSlot(
  alreadyBooked: Date,
  appointment_type: String,
  beforeOrAfterDesired: String,
  isBreakTime: Boolean
) {
  let hours = alreadyBooked.getHours();

  if (hours < 9 || hours >= 19 || hours === 13) {
    return null;
  } else {
    let cloneDate: Date = new Date(alreadyBooked);
    if (beforeOrAfterDesired === "BEFORE" && isBreakTime === false) {
      cloneDate.setMinutes(alreadyBooked.getMinutes() - 45);
    }

    const existingAppointment = await connection.db
      ?.collection("appointments")
      .findOne({
        type: appointment_type, // Ensure the appointment type matches
        startTime: { $lte: cloneDate }, // startTime should be before or equal to the desired time
        endTime: { $gt: cloneDate }, // endTime should be after the desired time
      });
    if (existingAppointment) {
      if (beforeOrAfterDesired === "BEFORE") {
        return recursiveAppointmentSlot(
          existingAppointment.startTime,
          appointment_type,
          beforeOrAfterDesired,
          false
        );
      } else {
        return recursiveAppointmentSlot(
          existingAppointment.endTime,
          appointment_type,
          beforeOrAfterDesired,
          false
        );
      }
    } else if (cloneDate.getHours() === 13) {
      cloneDate.setMinutes(15);
      cloneDate.setHours(12);
      return recursiveAppointmentSlot(
        cloneDate,
        appointment_type,
        beforeOrAfterDesired,
        true
      );
    } else {
      return cloneDate;
    }
  }
}

/**This route is being used if a same slot slot/nearby slot timings are available for appointment */
app.post("/sameDaySlot", async (req: Request, res: Response) => {
  try {
    let is_appointment_booked: boolean = false;
    let webhookResponse: String = "";
    const parameters = req.body?.sessionInfo?.parameters || {};
    const { appointment_slot, preffered_time, appointment_type, patient_id } =
      parameters;

    const desiredAppointmentSlot = new Date(appointment_slot);
    const { hours, minutes } = preffered_time;
    desiredAppointmentSlot.setHours(hours);
    desiredAppointmentSlot.setMinutes(minutes);

    if (desiredAppointmentSlot.getHours() === 13) {
      webhookResponse = "It's our lunch time";
    } else {
      const appointmentExists = await connection.db
        ?.collection("appointments")
        .findOne({
          type: appointment_type,
          startTime: { $lte: desiredAppointmentSlot },
          endTime: { $gt: desiredAppointmentSlot },
        });
      if (appointmentExists) {
        webhookResponse = `Unfortunately, your preferred slot for ${formatHumanReadableTime(
          desiredAppointmentSlot
        )} is already booked`;
      } else {
        let endTime: Date = new Date(desiredAppointmentSlot);
        endTime.setMinutes(endTime.getMinutes() + 45);

        if (!patient_id) {
          webhookResponse = ERROR_MESSAGES.defaultMessage;
        } else {
          let newAppointment: object = {
            startTime: desiredAppointmentSlot,
            endTime: endTime,
            type: appointment_type,
            patientId: patient_id,
          };

          const response = await connection.db
            ?.collection("appointments")
            .insertOne(newAppointment);

          if (response?.acknowledged) {
            is_appointment_booked = true;
            webhookResponse = `Your appointment for ${appointment_type} is confirmed for ${formatHumanReadableDate(
              desiredAppointmentSlot
            )} at ${formatHumanReadableTime(desiredAppointmentSlot)} .Thankyou`;
            const responsePayload = {
              fulfillment_response: {
                messages: [{ text: { text: [webhookResponse] } }],
              },
              sessionInfo: {
                parameters: {
                  type: appointment_type,
                  is_appointment_booked: is_appointment_booked,
                  is_nearest_slot_available: false,
                },
              },
            };
            res.json(responsePayload);
          } else {
            console.error(response);

            const responsePayload = {
              fulfillment_response: {
                messages: [{ text: { text: [ERROR_MESSAGES.defaultMessage] } }],
              },
              sessionInfo: {
                parameters: {
                  is_appointment_booked: false,
                },
              },
            };
            res.json(responsePayload);
          }
        }
      }
    }
  } catch (error) {
    console.error(error);

    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [ERROR_MESSAGES.defaultMessage] } }],
      },
      sessionInfo: {
        parameters: {
          is_appointment_booked: false,
        },
      },
    };
    res.json(responsePayload);
  }
});

/**This is inital route for appointment request */
app.post("/appointmentRequest", async (req: Request, res: Response) => {
  try {
    let webhookResponse: string = "";
    let is_appointment_booked: boolean = false;
    let is_nearest_slot_available: boolean = false;

    const parameters = req.body?.sessionInfo?.parameters || {};

    const { day, hours, minutes, month, year } = parameters?.appointment_slot;

    const appointment_type = parameters?.appointment_type;
    const patient_id = parameters?.patient_id;

    const isTimeValid = isTimeSlotValid(minutes, hours, day, month, year);

    if (!isTimeValid.isValid) {
      webhookResponse = isTimeValid.message;
      const responsePayload = {
        fulfillment_response: {
          messages: [{ text: { text: [webhookResponse] } }],
        },
        sessionInfo: {
          parameters: {
            is_appointment_booked: is_appointment_booked,
            appointment_slot: null,
            is_nearest_slot_available: is_nearest_slot_available,
          },
        },
      };
      res.json(responsePayload);
    } else {
      const desiredAppointmentSlot = new Date(
        year,
        month - 1,
        day,
        hours,
        minutes
      );
      let appointmentISO = desiredAppointmentSlot.toISOString();

      // -------------------------------------------------
      const existingAppointment = await connection.db
        ?.collection("appointments")
        .findOne({
          type: appointment_type, // Ensure the appointment type matches
          startTime: { $lte: desiredAppointmentSlot }, // startTime should be before or equal to the desired time
          endTime: { $gt: desiredAppointmentSlot }, // endTime should be after the desired time
        });

      if (existingAppointment) {
        webhookResponse = `Unfortunately,We are fully booked on ${formatHumanReadableDate(
          desiredAppointmentSlot
        )}`;
        const nearestAppointmentSlot: any = await getNearestAppointmentSlot(
          existingAppointment,
          appointment_type
        );
        if (nearestAppointmentSlot.isFound) {
          is_nearest_slot_available = true;

          if (
            nearestAppointmentSlot.beforeDesiredDate &&
            nearestAppointmentSlot.afterDesiredDate
          ) {
            webhookResponse = `Unfortunately, your preferred slot is already booked! Nearby slots available on ${formatHumanReadableDate(
              desiredAppointmentSlot
            )} are at ${formatHumanReadableTime(
              nearestAppointmentSlot.beforeDesiredDate
            )} and  at ${formatHumanReadableTime(
              nearestAppointmentSlot.afterDesiredDate
            )}.Do you want to book any of them ?`;
          } else if (nearestAppointmentSlot.beforeDesiredDate) {
            webhookResponse = `Unfortunately, your preferred slot is already booked! Nearby slot available on ${formatHumanReadableDate(
              desiredAppointmentSlot
            )} is at ${formatHumanReadableTime(
              nearestAppointmentSlot.beforeDesiredDate
            )}.Do you want to book this slot ?`;
          } else {
            webhookResponse = `Unfortunately, your preferred slot is already booked! Nearby slot available on ${formatHumanReadableDate(
              desiredAppointmentSlot
            )} is at ${formatHumanReadableTime(
              nearestAppointmentSlot.afterDesiredDate
            )}.Do you want to book this slot ?`;
          }
        }
        const responsePayload = {
          fulfillment_response: {
            messages: [{ text: { text: [webhookResponse] } }],
          },
          sessionInfo: {
            parameters: {
              is_appointment_booked,
              is_nearest_slot_available,
              appointment_slot: is_nearest_slot_available
                ? desiredAppointmentSlot
                : null,
            },
          },
        };
        res.json(responsePayload);
      } else {
        let endTime: Date = new Date(year, month - 1, day, hours, minutes + 45);

        if (!patient_id) {
          webhookResponse = ERROR_MESSAGES.defaultMessage;
        } else {
          let newAppointment: object = {
            startTime: desiredAppointmentSlot,
            endTime: endTime,
            type: appointment_type,
            patientId: patient_id,
          };

          const response = await connection.db
            ?.collection("appointments")
            .insertOne(newAppointment);

          if (response?.acknowledged) {
            is_appointment_booked = true;
            webhookResponse = `Your appointment for ${appointment_type} is confirmed for ${formatHumanReadableDate(
              desiredAppointmentSlot
            )} at ${formatHumanReadableTime(desiredAppointmentSlot)}. Thankyou`;
            const responsePayload = {
              fulfillment_response: {
                messages: [{ text: { text: [webhookResponse] } }],
              },
              sessionInfo: {
                parameters: {
                  appointmentDateTime: formatDate(appointmentISO),
                  type: appointment_type,
                  is_appointment_booked: is_appointment_booked,
                },
              },
            };
            res.json(responsePayload);
          } else {
            console.error(response);

            const responsePayload = {
              fulfillment_response: {
                messages: [{ text: { text: [ERROR_MESSAGES.defaultMessage] } }],
              },
              sessionInfo: {
                parameters: {
                  is_appointment_booked: false,
                },
              },
            };
            res.json(responsePayload);
          }
        }
      }
    }
  } catch (error) {
    console.error(error);
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [ERROR_MESSAGES.defaultMessage] } }],
      },
      sessionInfo: {
        parameters: {
          is_appointment_booked: false,
        },
      },
    };
    res.json(responsePayload);
  }
});

/**Here we are validating and extracting patient details */
app.post("/extractPatientDetails", async (req: Request, res: Response) => {
  try {
    // Extract session parameters
    const parameters = req.body?.sessionInfo?.parameters;
    let webhookResponse: string = "";
    let is_already_registered: boolean = false;


    let { firstname, lastname, dob } = parameters;

    firstname = extractDetails(typeof firstname == "object" ? firstname?.name : firstname , EXTRACT_DETAILS_KEYS.firstName);
    lastname = extractDetails(typeof lastname == "object" ? lastname?.name : lastname, EXTRACT_DETAILS_KEYS.lastName);

    /**Here this is an assumption being that if a patient has same firstname,lastname and dob.
     * It's the same although it can be untrue */
    var patientExists = await connection.db
      ?.collection("patients")
      .findOne({ firstName: firstname, lastName: lastname, dob });
    if (patientExists) {
      webhookResponse = `hii  ${firstname},It looks like you have already registered`;
      is_already_registered = true;
    }

    // Construct response
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [webhookResponse] } }],
      },
      sessionInfo: {
        parameters: {
          firstname: firstname,
          lastname: lastname,
          is_already_registered: is_already_registered,
          insurance_type: patientExists?.insurancePlanType
            ? patientExists.insurancePlanType
            : null,
          insurance_name: patientExists?.insuranceCompany
            ? patientExists.insuranceCompany
            : null,
        },
      },
    };

    res.json(responsePayload);
  } catch (error) {
    console.error(error);
    const responsePayload = {
      fulfillment_response: {
        messages: [{ text: { text: [ERROR_MESSAGES.defaultMessage] } }],
      },
    };
    res.json(responsePayload);
  }
});

// Starting the server
app.listen(port, () => {
  console.log(uri);
  console.log(`Server is running on localhost:${port}`);
});

function connectToDatabase() {
  mongoose
    .connect(uri, {})
    .then(() => {
      connection = mongoose.connection;
      console.log("Mongodb connection successful", connection);
    })
    .catch((error: ErrorRequestHandler) => {
      console.error("Mongodb connection failed", error);
      process.exit(); // Exiting our server beacause of an error in mongo db connection
    });
}
connectToDatabase();
