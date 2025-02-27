# Appointment System IVR

## Prerequisites

Before setting up and running the appointment system IVR, ensure that you have the following:

Node.js installed on your system.

Ngrok for exposing local servers to the internet.

Google Cloud Platform (GCP) Account for Dialogflow integration.

A Mobile Plan that allows calling US numbers.

## Phone Integration 
You can connect it with a phone gateway :- https://cloud.google.com/dialogflow/es/docs/integrations/phone-gateway

## Setup Instructions

1. Import the Flow:

Import the provided Dialogflow flow (file name exported_agent_voice-agent-ivr) into your Google Cloud Dialogflow project.

2.Start Ngrok:

Run the following command to expose port 4000: ngrok http 4000

3. Update Webhook in Dialogflow:

## Assumptions & Rules

**Operating Hours**: The clinic/hospital operates between 9:00 AM to 7:00 PM US/New York Time.

**Lunch Break**: No appointments are allowed between 1:00 PM to 2:00 PM US/New York Time.

**Closed on Sundays**: Appointments cannot be booked on Sundays.

**Single Doctor per Specialty**: Each appointment type (e.g., Physiotherapy, Dental) has only one assigned doctor.

**Time Zone Considerations**: All date and time-related operations are based on US/New York Time Zone.

**Nearest Available Slot Suggestion**: If the preferred appointment slot is unavailable, the system will automatically suggest the nearest available slot before or after the desired time.

## Features

**Dialogflow IVR Integration**: The system interacts with users through an IVR system powered by Dialogflow.

**Dynamic Slot Allocation**: The system checks appointment availability in real time and schedules appointments accordingly.

**Error Handling & Validations**: Ensures that invalid times (e.g., Sundays, lunch breaks) are not allowed.

**Fallback to Nearest Available Slots**: If the requested time is unavailable, it suggests the closest available slot.
