"use client";

import React from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import Select from "react-select";
import { TPerson } from "@/models/person";
import { TRelationship } from "@/models/relationship";
import { upsertRelationships } from "@/service/relationship";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import useStore from "@/zustand";

const RELATIONSHIP_TYPES: TRelationship["type"][] = [
  "parent",
  "spouse",
  "child",
];

function RelationshipForm({
  id,
  initialRelationships,
  initialPeople,
}: {
  id: string;
  initialRelationships: Partial<TRelationship>[];
  initialPeople: TPerson[];
}) {
  const router = useRouter();
  const { token, logout } = useStore();

  const options = initialPeople.map((person) => ({
    value: person._id,
    label: person.name,
  }));

  const { control, handleSubmit, getValues } = useForm<{
    relationships: Partial<TRelationship>[];
    to: string;
  }>({
    defaultValues: { relationships: initialRelationships, to: "" },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "relationships",
  });

  const {
    register: registerNew,
    handleSubmit: handleSubmitNew,
    reset: resetNew,
    formState: { errors: newErrors },
    setValue: setNewValue,
  } = useForm<Partial<TRelationship>>({
    defaultValues: {
      to: "",
      type: RELATIONSHIP_TYPES[0],
      order: 1,
    },
  });

  const onAdd = (data: Partial<TRelationship>) => {
    const newTo = data.to ?? "";
    const currentRelationships = getValues("relationships") || [];
    const isDuplicate = currentRelationships.some((rel) => rel.to === newTo);

    if (!newTo) {
      toast.error("Please select a person.");
      return;
    }

    if (isDuplicate) {
      toast.error("This person is already added.");
      return;
    }

    const newRelationship: Partial<TRelationship> = {
      to: newTo,
      type: data.type ?? RELATIONSHIP_TYPES[0],
      order: data.order ?? 1,
    };
    append(newRelationship);
    resetNew();
  };

  const onUpdate = async (data: {
    relationships: Partial<TRelationship>[];
  }) => {
    const { data: respData, message } = await upsertRelationships(
      id,
      data.relationships,
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
          <label className="mb-1 font-medium text-blue-900">To</label>
          <Controller
            control={control}
            name={`to`}
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
                  setNewValue("to", selected ? selected.value : "");
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
          {newErrors.to && (
            <span className="text-red-500 text-xs mt-1">Required</span>
          )}
        </div>
        <div className="flex flex-col flex-1 min-w-[120px]">
          <label className="mb-1 font-medium text-blue-900">Type</label>
          <select
            className="border border-blue-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
            {...registerNew("type", { required: true })}
          >
            {RELATIONSHIP_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col flex-1 min-w-[80px]">
          <label className="mb-1 font-medium text-blue-900">Order</label>
          <input
            className="border border-blue-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
            type="number"
            min={1}
            {...registerNew("order", { required: true, valueAsNumber: true })}
          />
          {newErrors.order && (
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
      {/* Edit Relationships Form */}
      <form onSubmit={handleSubmit(onUpdate)}>
        <ul>
          {fields.map((field, idx) => (
            <li
              key={field.id}
              className="flex flex-wrap items-center gap-4 mb-4 bg-gray-50 p-3 rounded-lg shadow"
            >
              <Controller
                control={control}
                name={`relationships.${idx}.to`}
                render={({ field }) => (
                  <div className="flex flex-col flex-1 min-w-[160px]">
                    <label className="mb-1 font-medium text-gray-700">To</label>
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
              <Controller
                control={control}
                name={`relationships.${idx}.type`}
                render={({ field }) => (
                  <div className="flex flex-col flex-1 min-w-[120px]">
                    <label className="mb-1 font-medium text-gray-700">
                      Type
                    </label>
                    <select
                      className="border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
                      {...field}
                    >
                      {RELATIONSHIP_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              />
              <Controller
                control={control}
                name={`relationships.${idx}.order`}
                render={({ field }) => (
                  <div className="flex flex-col flex-1 min-w-[80px]">
                    <label className="mb-1 font-medium text-gray-700">
                      Order
                    </label>
                    <input
                      className="border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
                      type="number"
                      min={1}
                      {...field}
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

export default RelationshipForm;
