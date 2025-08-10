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
  birthDate: z.string().min(1, "Birth date is required"),
  photoUrl: z.any().optional(),
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
  const { token } = useStore();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<PersonForm>({
    resolver: zodResolver(personSchema),
    defaultValues: {
      name: "",
      nickname: "",
      address: "",
      status: "alive",
      gender: "male",
      phone: "",
      birthDate: new Date().toISOString().split("T")[0],
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
    formData.append("birthDate", data.birthDate);
    if (data.photoUrl && data.photoUrl[0]) {
      formData.append("photoUrl", data.photoUrl[0]);
    }

    let response;
    if (mode === "edit" && initialValues?._id) {
      response = await updatePerson(formData, token);
    } else {
      response = await createPerson(formData, token);
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
                name="photoUrl"
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
                        onChange={(e) => field.onChange(e.target.files)}
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
                          {field.value && field.value.length > 0 ? (
                            <Image
                              src={URL.createObjectURL(field.value[0])}
                              alt="Preview"
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
              {errors.photoUrl && (
                <Text color="red" size="2" mt="1">
                  {errors.photoUrl.message as string}
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
