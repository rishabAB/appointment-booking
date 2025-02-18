import { ObjectId, Collection } from "mongodb";
import { EXTRACT_DETAILS_KEYS } from "./constants";

const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
export const patientIdRegex = /^[a-fA-F0-9]{24}$/;
const firstNameRegex =
  /\b(?:firstname is|it's|name is|my name is|okay firstname is | my firstname is )\s+(\w+)/i;
const lastNameRegex =
  /\b(?:lastname is|it's|surname is|my last name is|okay last name is)\s+(\w+)/i;
const insuranceNameRegex =
  /\b(?:health insurance provider is|it's|provider is|insurance is | my health insurance provider is | my insurance provider is | my health provider is )\s+([\w\s-]+)/i;

const insuranceTypeRegex =
  /\b(?:health insurance type is|it's|insurance type is|type is|my health insurance type is |okay,type is | okay it is)\s+([\w\s-]+)/i;

/**@param dob  */
/**Here we are validating that the dob user has provided is valid or not */
export const validateDOB = (dob: any): boolean => {
  // ---
  const { year, month, day } = dob;
  const dobDate = new Date(year, month - 1, day);
  const today = new Date();

  today.setHours(0, 0, 0, 0);
  const newYorkTime = new Date(
    today.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  newYorkTime.setHours(0, 0, 0, 0);

  return dobDate <= newYorkTime; // DOB should not be greater than today
};

/**@param idOrEmail */
/**Here we are getting a valid identifier by validating that it's patientId or email */
export const getValidIdentifier = (
  idOrEmail: string
): Promise<string | null> => {
  return new Promise((resolve, _reject) => {
    const arrayOfString: string[] = idOrEmail.split(" ");
    const match = arrayOfString.find(
      (elem: string) => emailRegex.test(elem) || patientIdRegex.test(elem)
    );
    resolve(match || null);
  });
};

/**@param identifier, @param collection */
/** We are using findone in order to find user in our db */
export const findUser = async (
  identifier: string,
  collection: Collection
): Promise<any | null> => {
  let query;

  if (ObjectId.isValid(identifier)) {
    query = { $or: [{ _id: new ObjectId(identifier) }, { email: identifier }] };
  } else {
    query = { email: identifier };
  }

  return await collection.findOne(query);
};

/**@param isoString */
/**We are returning a formatted date */
export const formatDate = (isoString: string): string => {
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
};

/**@param inputString, @param keyWord */
/** We are extracting patient details by removing unecessary keywords like 'this','it's ' ,...*/
export const extractDetails = (inputString: String, keyWord: String) => {
  switch (keyWord) {
    case EXTRACT_DETAILS_KEYS.firstName:
      const firstName = inputString.match(firstNameRegex);
      return firstName ? firstName[1] : inputString; // Return the first name or null if not found

    case EXTRACT_DETAILS_KEYS.lastName:
      const lastName = inputString.match(firstNameRegex);
      return lastName ? lastName[1] : inputString; // Return the first name or null if not found

    case EXTRACT_DETAILS_KEYS.email:
      const arrayOfString: string[] = inputString.split(" ");
      const email = arrayOfString.find((elem: string) => emailRegex.test(elem));
      return email ? email : null;

    case EXTRACT_DETAILS_KEYS.insuranceName:
      const insuranceName = inputString.match(insuranceNameRegex);
      return insuranceName ? insuranceName[1] : inputString;

    case EXTRACT_DETAILS_KEYS.insuranceType:
      const insuranceType = inputString.match(insuranceTypeRegex);
      return insuranceType ? insuranceType[1] : inputString;
  }
};



/**@param minutes, @param hours , @param day , @param month , @param year */
/**Here We are chekcing few conditions for invalid paramters and other
 * conditions like clinic/timings ,lunch break timings , ... */
export const isTimeSlotValid = (
  minutes: number,
  hours: number,
  day: number,
  month: number,
  year: number
): any => {
  // Create the date object (local time)
  if (
    minutes == undefined ||
    hours == undefined ||
    day == undefined ||
    month == undefined ||
    year == undefined
  ) {
    return { isValid: false, message: "This time slot is not valid" };
  }

  const appointmentDate = new Date(year, month - 1, day, hours, minutes);

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  const newYorkTime = new Date(
    today.toLocaleString("en-US", { timeZone: "America/New_York" })
  );

  // Extract the day of the week (0 = Sunday, 6 = Saturday)
  const dayOfWeek = appointmentDate.getDay();

  // Extract hours and minutes in New York time
  const nyHours = appointmentDate.getHours();

  // Check if it's past date
  if (appointmentDate <= newYorkTime) {
    return {
      isValid: false,
      message: "Appointment date cannot be of the past",
    };
  }

  // Check if it's Sunday
  if (dayOfWeek === 0) {
    return { isValid: false, message: "We don't work on sundays" };
  }

  // Check if time is outside 9 AM - 7 PM
  if (nyHours < 9 || nyHours >= 19) {
    return { isValid: false, message: "We operate from 9am to 7pm" };
  }

  // Check if time is between 1 PM - 2 PM (don't include 2 PM)
  if (nyHours === 13) {
    return { isValid: false, message: "It's our lunch time" };
  }

  return { isValid: true, message: null };
};

/**@param date */
/**We are getting human readable time like 3pm */
export const formatHumanReadableTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**@param date */
/**We are getting human readable time like 1st March */
export const formatHumanReadableDate = (date: Date): string => {
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "long" });

  // Function to get ordinal suffix (st, nd, rd, th)
  const getOrdinalSuffix = (day: number) => {
    if (day >= 11 && day <= 13) return "th"; // Special case for 11, 12, 13
    switch (day % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  };

  return `${day}${getOrdinalSuffix(day)} ${month}`;
};
