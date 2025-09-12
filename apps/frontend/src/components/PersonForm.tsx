"use client";

import { useForm, Controller } from "react-hook-form";
import { TextField, Select, Flex, Box, Text, Button } from "@radix-ui/themes";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Label } from "@/components/ui/label";
import { createPerson, updatePerson } from "@/service/person";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import useStore from "@/zustand";
import { useEffect } from "react";
import Image from "next/image";

// Zod schema for validation
const personSchema = z.object({
  name: z.string().min(1, "Name is required"),
  nickname: z.string().min(1, "Nickname is required"),
  address: z.string().min(1, "Address is required"),
  status: z.enum(["alive", "deceased"]),
  gender: z.enum(["male", "female"]),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  photo: z
    .any()
    .refine(
      (files) =>
        !files ||
        (files instanceof FileList && files.length === 0) ||
        (files instanceof FileList &&
          files.length === 1 &&
          files[0] instanceof File),
      "Photo must be a file"
    )
    .optional(),
  photoUrl: z.string().optional(),
});

export type PersonForm = z.infer<typeof personSchema>;

type PersonFormProps = {
  mode: "create" | "edit";
  initialValues?: Partial<PersonForm> & { _id?: string };
  onSuccess?: () => void;
};

export default function PersonFormComponent({
  mode,
  initialValues,
  onSuccess,
}: PersonFormProps) {
  const router = useRouter();
  const { token, logout } = useStore();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    getValues,
  } = useForm<PersonForm>({
    resolver: zodResolver(personSchema),
    defaultValues: {
      name: "",
      nickname: "",
      address: "",
      status: "alive",
      gender: "male",
      phone: "",
      birthDate: "",
      ...initialValues,
    },
  });

  // Set initial values when editing
  useEffect(() => {
    if (mode === "edit" && initialValues) {
      Object.entries(initialValues).forEach(([key, value]) => {
        if (value !== undefined && key !== "photoUrl") {
          setValue(
            key as keyof PersonForm,
            value as PersonForm[keyof PersonForm]
          );
        }
      });
    }
    // eslint-disable-next-line
  }, [initialValues, mode]);

  const onSubmit = async (data: PersonForm) => {
    const formData = new FormData();
    formData.append("id", initialValues?._id || "");
    formData.append("name", data.name);
    formData.append("nickname", data.nickname);
    formData.append("address", data.address);
    formData.append("status", data.status);
    formData.append("gender", data.gender);
    if (data.phone) formData.append("phone", data.phone);
    if (data.birthDate) formData.append("birthDate", data.birthDate);
    if (data.photo && data.photo[0]) {
      formData.append("photo", data.photo[0]);
    }

    let response;
    if (mode === "edit" && initialValues?._id) {
      response = await updatePerson(formData, token, logout);
    } else {
      response = await createPerson(formData, token, logout);
    }

    const { data: responseData, message } = response;
    if (!responseData) {
      toast.error(message);
      return;
    }

    reset();
    toast.success(
      mode === "edit"
        ? "Person updated successfully!"
        : "Person created successfully!"
    );
    if (onSuccess) onSuccess();
    else router.push("/person");
  };

  return (
    <Flex align="center" justify="center" style={{ minHeight: "100vh" }}>
      <Box
        style={{
          background: "white",
          padding: 40,
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          minWidth: 420,
          maxWidth: 480,
          height: "100%",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <Text as="div" size="7" weight="bold" mb="6" align="center">
          👤 {mode === "edit" ? "Edit Person" : "Create Person"}
        </Text>
        <form onSubmit={handleSubmit(onSubmit)} encType="multipart/form-data">
          <Flex direction="column" gap="5">
            <Label style={{ fontWeight: 500 }}>
              Name <span className="required-asterisk">*</span>
              <TextField.Root
                placeholder="Full name"
                {...register("name")}
                autoComplete="off"
                size="3"
                style={{ marginTop: 6 }}
              />
              {errors.name && (
                <Text color="red" size="2" mt="1">
                  {errors.name.message}
                </Text>
              )}
            </Label>

            <Label style={{ fontWeight: 500 }}>
              Nickname <span className="required-asterisk">*</span>
              <TextField.Root
                placeholder="Nick name"
                {...register("nickname")}
                autoComplete="off"
                size="3"
                style={{ marginTop: 6 }}
              />
              {errors.nickname && (
                <Text color="red" size="2" mt="1">
                  {errors.nickname.message}
                </Text>
              )}
            </Label>

            <Label style={{ fontWeight: 500 }}>
              Address <span className="required-asterisk">*</span>
              <TextField.Root
                placeholder="Address"
                {...register("address")}
                autoComplete="off"
                size="3"
                style={{ marginTop: 6 }}
              />
              {errors.address && (
                <Text color="red" size="2" mt="1">
                  {errors.address.message}
                </Text>
              )}
            </Label>

            <Flex gap="4">
              <Box style={{ flex: 1 }}>
                <Label
                  style={{ fontWeight: 500, marginBottom: 6, display: "block" }}
                >
                  Status <span className="required-asterisk">*</span>
                </Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select.Root
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <Select.Trigger
                        placeholder="Select status"
                        style={{
                          width: "100%",
                          background: "#fafbfc",
                          border: "1px solid #e0e0e0",
                          borderRadius: 8,
                          padding: "10px 14px",
                          fontSize: 16,
                          fontWeight: 500,
                          color: "#222",
                          marginBottom: 2,
                        }}
                      />
                      <Select.Content>
                        <Select.Item value="alive">🟢 Alive</Select.Item>
                        <Select.Item value="deceased">⚫ Deceased</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  )}
                />
                {errors.status && (
                  <Text color="red" size="2" mt="1">
                    {errors.status.message}
                  </Text>
                )}
              </Box>
              <Box style={{ flex: 1 }}>
                <Label
                  style={{ fontWeight: 500, marginBottom: 6, display: "block" }}
                >
                  Gender <span className="required-asterisk">*</span>
                </Label>
                <Controller
                  control={control}
                  name="gender"
                  render={({ field }) => (
                    <Select.Root
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <Select.Trigger
                        placeholder="Select gender"
                        style={{
                          width: "100%",
                          background: "#fafbfc",
                          border: "1px solid #e0e0e0",
                          borderRadius: 8,
                          padding: "10px 14px",
                          fontSize: 16,
                          fontWeight: 500,
                          color: "#222",
                          marginBottom: 2,
                        }}
                      />
                      <Select.Content>
                        <Select.Item value="male">♂️ Male</Select.Item>
                        <Select.Item value="female">♀️ Female</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  )}
                />
                {errors.gender && (
                  <Text color="red" size="2" mt="1">
                    {errors.gender.message}
                  </Text>
                )}
              </Box>
            </Flex>

            <Label style={{ fontWeight: 500 }}>
              Phone
              <TextField.Root
                placeholder="Phone number"
                {...register("phone")}
                autoComplete="off"
                size="3"
                style={{ marginTop: 6 }}
              />
              {errors.phone && (
                <Text color="red" size="2" mt="1">
                  {errors.phone.message}
                </Text>
              )}
            </Label>

            <Label style={{ fontWeight: 500 }}>
              Birth Date
              <Box
                style={{
                  position: "relative",
                  marginTop: 6,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <input
                  type="date"
                  {...register("birthDate")}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "#fafbfc",
                    border: "1px solid #e0e0e0",
                    borderRadius: 8,
                    fontSize: 16,
                    fontFamily: "inherit",
                  }}
                />
              </Box>
              {errors.birthDate && (
                <Text color="red" size="2" mt="1">
                  {errors.birthDate.message}
                </Text>
              )}
            </Label>

            <Label style={{ fontWeight: 500 }}>
              Photo
              <Controller
                control={control}
                name="photo"
                render={({ field }) => (
                  <Box
                    style={{
                      marginTop: 6,
                      padding: "18px 14px",
                      background: "#fafbfc",
                      border: "1px dashed #bdbdbd",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      transition: "border 0.2s",
                    }}
                    asChild
                  >
                    <label style={{ width: "100%", cursor: "pointer" }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            const file = files[0];
                            if (file.size > 1024 * 1024) {
                              // Compress image if > 1MB
                              const compressImage = async (file: File) => {
                                return new Promise<File>((resolve, reject) => {
                                  const img = new window.Image();
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    img.onload = () => {
                                      const canvas =
                                        document.createElement("canvas");
                                      let width = img.width;
                                      let height = img.height;
                                      // Scale down if needed
                                      const maxSize = 1200;
                                      if (width > maxSize || height > maxSize) {
                                        if (width > height) {
                                          height = Math.round(
                                            (height * maxSize) / width
                                          );
                                          width = maxSize;
                                        } else {
                                          width = Math.round(
                                            (width * maxSize) / height
                                          );
                                          height = maxSize;
                                        }
                                      }
                                      canvas.width = width;
                                      canvas.height = height;
                                      const ctx = canvas.getContext("2d");
                                      ctx?.drawImage(img, 0, 0, width, height);
                                      // Try different qualities to get under 1MB
                                      let quality = 0.8;
                                      let blob: Blob | null = null;
                                      const tryCompress = () => {
                                        canvas.toBlob(
                                          (b) => {
                                            if (b && b.size <= 1024 * 1024) {
                                              blob = b;
                                              resolve(
                                                new File([blob], file.name, {
                                                  type: "image/jpeg",
                                                })
                                              );
                                            } else if (quality > 0.3) {
                                              quality -= 0.1;
                                              canvas.toBlob(
                                                (b2) => {
                                                  if (b2) {
                                                    if (
                                                      b2.size <=
                                                      1024 * 1024
                                                    ) {
                                                      resolve(
                                                        new File(
                                                          [b2],
                                                          file.name,
                                                          {
                                                            type: "image/jpeg",
                                                          }
                                                        )
                                                      );
                                                    } else {
                                                      quality -= 0.1;
                                                      tryCompress();
                                                    }
                                                  } else {
                                                    reject(
                                                      new Error(
                                                        "Compression failed"
                                                      )
                                                    );
                                                  }
                                                },
                                                "image/jpeg",
                                                quality
                                              );
                                            } else {
                                              // If still too big, just use the last blob
                                              if (b) {
                                                resolve(
                                                  new File([b], file.name, {
                                                    type: "image/jpeg",
                                                  })
                                                );
                                              } else {
                                                reject(
                                                  new Error(
                                                    "Compression failed"
                                                  )
                                                );
                                              }
                                            }
                                          },
                                          "image/jpeg",
                                          quality
                                        );
                                      };
                                      tryCompress();
                                    };
                                    img.onerror = () =>
                                      reject(new Error("Invalid image file"));
                                    img.src = event.target?.result as string;
                                  };
                                  reader.onerror = () =>
                                    reject(new Error("File read error"));
                                  reader.readAsDataURL(file);
                                });
                              };

                              try {
                                const compressed = await compressImage(file);
                                // Create a new FileList-like object
                                const dt = new DataTransfer();
                                dt.items.add(compressed);
                                field.onChange(dt.files);
                              } catch {
                                toast.error(
                                  "Failed to compress image under 1MB."
                                );
                                field.onChange(null);
                              }
                            } else {
                              field.onChange(files);
                            }
                          } else {
                            field.onChange(files);
                          }
                        }}
                        style={{
                          display: "none",
                        }}
                      />
                      <Flex align="center" gap="3">
                        <Box
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: "#e0e7ef",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 20,
                            color: "#6b7280",
                          }}
                        >
                          {(field.value && field.value.length > 0) ||
                          getValues("photoUrl") ? (
                            <Image
                              src={
                                field.value && field.value.length > 0
                                  ? URL.createObjectURL(field.value[0])
                                  : getValues("photoUrl") ||
                                    "/default-avatar.png"
                              }
                              alt="Preview"
                              width={36}
                              height={36}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                borderRadius: "50%",
                              }}
                            />
                          ) : (
                            "📷"
                          )}
                        </Box>
                        <Text size="3" color="gray">
                          {field.value && field.value.length > 0
                            ? field.value[0].name
                            : "Choose a photo"}
                        </Text>
                      </Flex>
                    </label>
                  </Box>
                )}
              />
              {errors.photo && (
                <Text color="red" size="2" mt="1">
                  {errors.photo.message as string}
                </Text>
              )}
            </Label>

            <Button
              type="submit"
              disabled={isSubmitting}
              size="4"
              style={{
                marginTop: 24,
                borderRadius: 8,
                fontWeight: 600,
                letterSpacing: 1,
              }}
            >
              {isSubmitting
                ? mode === "edit"
                  ? "Updating..."
                  : "Submitting..."
                : mode === "edit"
                  ? "Update"
                  : "Create"}
            </Button>
          </Flex>
        </form>
      </Box>
    </Flex>
  );
}
