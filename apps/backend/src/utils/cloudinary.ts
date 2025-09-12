import path from "path";
import crypto from "crypto";
import * as cloudinary from "cloudinary";
import logger from "./logger";
import { UploadedFile } from "express-fileupload";

/* Cloudinary config */
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* Cloudinary Uploader */
export const uploader = (file: {
  tempFilePath: string;
}): Promise<cloudinary.UploadApiResponse | undefined> => {
  return new Promise((resolve, reject) => {
    cloudinary.v2.uploader.upload(file.tempFilePath, (err, result) => {
      if (err) {
        logger.error(err);
        reject(err);
        return;
      }

      resolve(result);
    });
  });
};

export const uploadImage = async (file: UploadedFile) => {
  const fileName = crypto.randomBytes(16).toString("hex");
  file.name = `${fileName}${path.parse(file.name).ext}`;

  const imageUpload = await uploader(file);
  return imageUpload?.secure_url;
};
