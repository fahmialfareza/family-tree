"use client";

import React from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import Select from "react-select";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import useStore from "@/zustand";
import { TUser } from "@/models/user";
import { updateOwnership } from "@/service/person";

function OwnershipForm({
  id,
  initialOwners,
  initialUsers,
}: {
  id: string;
  initialOwners: Partial<TUser>[];
  initialUsers: TUser[];
}) {
  const router = useRouter();
  const { token, logout } = useStore();

  const options = initialUsers.map((user) => ({
    value: user._id,
    label: user.name,
  }));

  const { control, handleSubmit, getValues } = useForm<{
    owners: Partial<TUser>[];
    _id: string;
  }>({
    defaultValues: { owners: initialOwners, _id: "" },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "owners",
  });

  const {
    handleSubmit: handleSubmitNew,
    reset: resetNew,
    formState: { errors: newErrors },
    setValue: setNewValue,
  } = useForm<Partial<TUser>>({
    defaultValues: {
      _id: "",
    },
  });

  const onAdd = (data: Partial<TUser>) => {
    const newId = data._id ?? "";
    const currentOwners = getValues("owners") || [];
    const isDuplicate = currentOwners.some((owner) => owner._id === newId);

    if (!newId) {
      toast.error("Please select a user.");
      return;
    }

    if (isDuplicate) {
      toast.error("This user is already added.");
      return;
    }

    const newOwnership: Partial<TUser> = {
      _id: newId,
    };
    append(newOwnership);
    resetNew();
  };

  const onUpdate = async (data: { owners: Partial<TUser>[] }) => {
    if (data.owners.length === 0) {
      toast.error("Please add at least one owner.");
      return;
    }

    const { data: respData, message } = await updateOwnership(
      id,
      data.owners
        .map((owner) => owner._id)
        .filter((id): id is string => typeof id === "string"),
      token,
      logout
    );
    if (!respData) {
      toast.error(message);
      return;
    }

    router.push(`/person`);
  };

  const handleDelete = (idx: number) => {
    remove(idx);
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <h1 className="text-3xl font-extrabold mb-6 text-center text-blue-700">
        Relationships
      </h1>
      {/* Add Relationship Form */}
      <form
        onSubmit={handleSubmitNew(onAdd)}
        className="mb-8 flex flex-wrap gap-4 items-end bg-blue-50 p-4 rounded-lg shadow"
      >
        <div className="flex flex-col flex-1 min-w-[160px]">
          <label className="mb-1 font-medium text-blue-900">User</label>
          <Controller
            control={control}
            name={`_id`}
            render={({ field }) => (
              <Select
                options={options}
                value={
                  field.value === "" || !field.value
                    ? null
                    : options.find((option) => option.value === field.value) ||
                      null
                }
                onChange={(selected) => {
                  field.onChange(selected ? selected.value : "");
                  setNewValue("_id", selected ? selected.value : "");
                }}
                placeholder="Select Person"
                isClearable
                classNamePrefix="react-select"
                styles={{
                  control: (base, state) => ({
                    ...base,
                    borderColor: state.isFocused ? "#60a5fa" : "#93c5fd", // blue-400 / blue-300
                    boxShadow: state.isFocused
                      ? "0 0 0 2px #60a5fa"
                      : undefined,
                    padding: "2px 0",
                    minHeight: "38px",
                    borderRadius: "0.5rem", // rounded
                    fontSize: "1rem",
                  }),
                  menu: (base) => ({
                    ...base,
                    zIndex: 20,
                  }),
                }}
              />
            )}
          />
          {newErrors._id && (
            <span className="text-red-500 text-xs mt-1">Required</span>
          )}
        </div>

        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded shadow transition"
          type="submit"
        >
          Add
        </button>
      </form>
      {/* Edit Ownership Form */}
      <form onSubmit={handleSubmit(onUpdate)}>
        <ul>
          {fields.map((field, idx) => (
            <li
              key={field.id}
              className="flex flex-wrap items-center gap-4 mb-4 bg-gray-50 p-3 rounded-lg shadow"
            >
              <Controller
                control={control}
                name={`owners.${idx}._id`}
                render={({ field }) => (
                  <div className="flex flex-col flex-1 min-w-[160px]">
                    <label className="mb-1 font-medium text-gray-700">
                      User
                    </label>
                    <Select
                      options={options}
                      value={
                        options.find(
                          (option) => option.value === field.value
                        ) || null
                      }
                      onChange={(selected) =>
                        field.onChange(selected ? selected.value : "")
                      }
                      placeholder="Select Person"
                      isClearable
                      classNamePrefix="react-select"
                      styles={{
                        control: (base, state) => ({
                          ...base,
                          borderColor: state.isFocused ? "#60a5fa" : "#93c5fd",
                          boxShadow: state.isFocused
                            ? "0 0 0 2px #60a5fa"
                            : undefined,
                          padding: "2px 0",
                          minHeight: "38px",
                          borderRadius: "0.5rem",
                          fontSize: "1rem",
                        }),
                        menu: (base) => ({
                          ...base,
                          zIndex: 20,
                        }),
                      }}
                    />
                  </div>
                )}
              />
              <button
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow transition"
                type="button"
                onClick={() => handleDelete(idx)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
        <button
          className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded mt-6 shadow transition block mx-auto"
          type="submit"
        >
          Save Changes
        </button>
      </form>
    </div>
  );
}

export default OwnershipForm;
