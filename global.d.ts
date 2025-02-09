import mongoose from "mongoose";

declare global {
  namespace NodeJS {
    interface Global {
      connection: mongoose.Connection | undefined;
    }
  }

  var connection: mongoose.Connection | undefined;
}

export {}; // Ensure this file is treated as a module
