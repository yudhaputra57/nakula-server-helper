const express = require('express');
const fs = require("fs");
const path = require("path");
const dotenv = require('dotenv');
const axios = require('axios');

const app = express();
app.use(express.json());
dotenv.config();
const PORT = process.env.PORT || 3050;

async function CheckDiff() {
    console.log("Checking diff");
  
    try {
      // Fetch all property codes
      const allPropertyCodesResponse = await axios.get(`${process.env.NAKULA_BACKEND_URL}/api/propertyCode/all`);
      const allPropertyCodes = allPropertyCodesResponse.data.data;
  
      for (const propertyCode of allPropertyCodes) {
        console.log(`Processing property code: ${propertyCode}`);
  
        try {
          // Fetch availabilities from Booking Engine (reference)
          const bookingResponse = await axios.get(`${process.env.NAKULA_BOOKING_ENGINE_URL}/api/v1/availabilities/property/${propertyCode}`);
          const propertyAvailabilitiesBookingMapped = bookingResponse.data.availabilities.map(({ date, is_blocked }) => ({
            property_code: propertyCode,
            date,
            is_blocked,
          }));
  
          // Fetch availabilities from Nakula (data to update)
          const nakulaResponse = await axios.get(`${process.env.NAKULA_BACKEND_URL}/api/availabilities/${propertyCode}`);
          const propertyAvailabilitiesNakulaMapped = nakulaResponse.data.data.map(({ date, is_blocked }) => ({
            property_code: propertyCode,
            date: new Date(date).toISOString().split("T")[0],
            is_blocked,
          }));
  
          // Map the Booking Engine array for reference
          const bookingMap = new Map(propertyAvailabilitiesBookingMapped.map(item => [item.date, item.is_blocked]));
  
          // Find differences where Nakula needs to be updated
          const differences = propertyAvailabilitiesBookingMapped.filter(
            item =>
              !propertyAvailabilitiesNakulaMapped.some(
                nakulaItem => nakulaItem.date === item.date && nakulaItem.is_blocked === item.is_blocked
              )
          );
  
  
          // Log differences to a daily log file if any
          if (differences.length > 0) {
            const currentDate = new Date().toISOString().split("T")[0]; // Get current date in YYYY-MM-DD format
            const logFileName = `/logger/differences_${currentDate}.txt`;
            const logFilePath = path.join(__dirname, logFileName);
            const logMessage = `Difference checking on ${new Date()}\nDifferences for property code ${propertyCode}: ${JSON.stringify(differences, null, 2)}\n`;

            // Append to daily log file
            fs.appendFileSync(logFilePath, logMessage, "utf8");

            console.log(`Differences logged for property code ${propertyCode} in file: ${logFileName}`);

            // Send differences to the backend
            await axios.post(`${process.env.NAKULA_BACKEND_URL}/api/updateData`, differences);
            console.log(`Updated data for property code ${propertyCode}`);

            // Add a delay to prevent overwhelming the backend
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
  
        } catch (error) {
          console.error(`Error processing property code ${propertyCode}:`, error.message);
        }
      }
    } catch (error) {
      console.error("Error fetching property codes:", error.message);
    }
}

const checkDiffWithInterval = setInterval(CheckDiff, 1000 * 60 * 60);

app.listen(PORT, async () => {
    checkDiffWithInterval;
    console.log(`server is running on port`, PORT, `the server backend and booking engine url is:`, process.env.NAKULA_BACKEND_URL, process.env.NAKULA_BOOKING_ENGINE_URL)
    await CheckDiff();
});