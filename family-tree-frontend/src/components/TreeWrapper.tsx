"use client";

import React, { useEffect, useRef } from "react";
import Tree, { RawNodeDatum } from "react-d3-tree";
import * as htmlToImage from "html-to-image";
import { useState } from "react";
import { getPerson } from "@/service/person";
import useStore from "@/zustand";
import { toast } from "react-toastify";
import { TPerson } from "@/models/person";
import { Button } from "./ui/button";
import PhotoModal from "./PhotoModal";
import PhoneButton from "./PhoneButton";

export interface FamilyTreeNode {
  _id: string;
  name: string;
  children: FamilyTreeNode[];
  attributes: Record<string, string | number | boolean>;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  node: FamilyTreeNode | null;
}

function ShowPhoto({ person }: { person: TPerson }) {
  const value = person?.photoUrl;
  const [open, setOpen] = useState(false);

  if (!value) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        type="button"
      >
        See Photo
      </Button>
      {open && (
        <PhotoModal image={value} name={person?.name} setOpen={setOpen} />
      )}
    </>
  );
}

const MemberDetailModal: React.FC<ModalProps> = ({ open, onClose, node }) => {
  const { token, logout } = useStore();
  const [data, setData] = useState<TPerson>();

  useEffect(() => {
    const fetchData = async () => {
      const { data, message } = await getPerson(node!._id, token, logout);
      if (!data) {
        toast.error(message);
        onClose();
      }

      setData(data);
    };

    if (node?._id) {
      fetchData();
    }
  }, [node?._id]);

  if (!open || !node) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 32,
          minWidth: 320,
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <strong>Nickname:</strong> {data?.nickname}
        </div>
        <div>
          <strong>Name:</strong> {data?.name}
        </div>
        <div>
          <strong>Address:</strong> {data?.address}
        </div>
        <div>
          <strong>Status:</strong> {data?.status}
        </div>
        <div>
          <strong>Relationship:</strong> <br />
          <ul
            className="list-disc ps-4 space-y-1"
            style={{ listStyleType: "disc", paddingLeft: "1.5rem" }}
          >
            {data?.relationships?.map((rel) => {
              if (!rel.toDetails) return null;
              let label = "";
              if (rel.type === "spouse") {
                if (data?.gender === "male") {
                  label = `Husband of ${
                    rel.toDetails.nickname || rel.toDetails.name
                  }`;
                } else if (data?.gender === "female") {
                  label = `Wife of ${
                    rel.toDetails.nickname || rel.toDetails.name
                  }`;
                } else {
                  label = `Spouse of ${
                    rel.toDetails.nickname || rel.toDetails.name
                  }`;
                }
              } else if (rel.type === "parent") {
                if (data?.gender === "male") {
                  label = `Dad of ${
                    rel.toDetails.nickname || rel.toDetails.name
                  }`;
                } else if (data?.gender === "female") {
                  label = `Mom of ${
                    rel.toDetails.nickname || rel.toDetails.name
                  }`;
                } else {
                  label = `Parent of ${
                    rel.toDetails.nickname || rel.toDetails.name
                  }`;
                }
              } else {
                label = `Child of ${
                  rel.toDetails.nickname || rel.toDetails.name
                }`;
              }
              return (
                <li
                  key={rel._id}
                  tabIndex={0}
                  style={{
                    outline: "none",
                    cursor: "pointer",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const items = Array.from(
                        (
                          e.currentTarget.parentNode as HTMLElement
                        ).querySelectorAll("li")
                      ) as HTMLLIElement[];
                      const idx = items.indexOf(
                        e.currentTarget as HTMLLIElement
                      );
                      let nextIdx = e.shiftKey ? idx - 1 : idx + 1;
                      if (nextIdx < 0) nextIdx = items.length - 1;
                      if (nextIdx >= items.length) nextIdx = 0;
                      items[nextIdx].focus();
                    }
                  }}
                >
                  {label}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <strong>Phone:</strong>{" "}
          {data?.phone && <PhoneButton value={data?.phone} withFlex={false} />}
        </div>
        <div>
          <strong>Birth Date:</strong>{" "}
          {data?.birthDate
            ? new Date(data.birthDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : ""}
        </div>
        <div>
          <strong>Photo:</strong> <ShowPhoto person={data!} key={data?._id} />
        </div>
        <button
          style={{
            marginTop: 24,
            padding: "8px 20px",
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

function useModal() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<FamilyTreeNode | null>(null);

  const openModal = (node: FamilyTreeNode) => {
    setSelectedNode(node);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

  return { modalOpen, selectedNode, openModal, closeModal };
}

const renderRectSvgNode = (modalHandler: (node: FamilyTreeNode) => void) => {
  const CustomNode = ({ nodeDatum }: { nodeDatum: RawNodeDatum }) => {
    return (
      <g>
        <rect
          width={160}
          height={
            nodeDatum.attributes
              ? Object.keys(nodeDatum.attributes).length * 10 + 70
              : 70
          }
          x={-80}
          y={-35}
          fill="#fff"
          stroke="#6366f1"
          strokeWidth={2}
          rx={16}
          onClick={(e) => {
            e.stopPropagation();
            modalHandler(nodeDatum as FamilyTreeNode);
          }}
          style={{
            cursor: "pointer",
          }}
        />
        <text
          fill="#1e293b"
          x={0}
          y={0}
          textAnchor="middle"
          alignmentBaseline="middle"
          fontSize={16}
          paintOrder="stroke"
          shapeRendering="geometricPrecision"
          style={{ pointerEvents: "none" }}
        >
          {nodeDatum.name}
        </text>
        {nodeDatum.attributes && (
          <g>
            {Object.entries(nodeDatum.attributes).map(([key, value], idx) => (
              <text
                key={key}
                fill="#1e293b"
                x={0}
                y={22 + idx * 16}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontSize={12}
                style={{
                  fontWeight: 100,
                  pointerEvents: "none",
                  textShadow: "0 1px 2px #fff, 0 -1px 2px #fff",
                }}
              >
                <tspan>{key}:</tspan> <tspan>{String(value)}</tspan>
              </text>
            ))}
          </g>
        )}
      </g>
    );
  };
  CustomNode.displayName = "CustomNode";
  return CustomNode;
};

export default function TreeWrapper({ data }: { data: FamilyTreeNode }) {
  const treeRef = useRef<HTMLDivElement>(null);
  const { modalOpen, selectedNode, openModal, closeModal } = useModal();

  const handleDownload = async () => {
    if (treeRef.current) {
      const dataUrl = await htmlToImage.toPng(treeRef.current);
      const link = document.createElement("a");
      link.download = "family-tree.png";
      link.href = dataUrl;
      link.click();
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: "linear-gradient(135deg, #e0e7ff 0%, #f8fafc 100%)",
        overflow: "auto",
      }}
    >
      <div style={{ padding: 16 }}>
        <button
          onClick={handleDownload}
          style={{
            marginRight: 8,
            padding: "10px 20px",
            background: "linear-gradient(90deg, #6366f1 0%, #818cf8 100%)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(99,102,241,0.15)",
            cursor: "pointer",
            transition: "background 0.2s, transform 0.1s",
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.background =
              "linear-gradient(90deg, #4f46e5 0%, #6366f1 100%)")
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.background =
              "linear-gradient(90deg, #6366f1 0%, #818cf8 100%)")
          }
        >
          Download as PNG
        </button>
      </div>
      <div
        ref={treeRef}
        style={{
          width: "100vw",
          height: "90vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Tree
            data={data}
            pathFunc="step"
            separation={{ siblings: 2, nonSiblings: 2 }}
            orientation="vertical"
            translate={{
              x: treeRef.current
                ? treeRef.current.offsetWidth / 3
                : window.innerWidth / 3,
              y: 100,
            }}
            renderCustomNodeElement={renderRectSvgNode(openModal)}
            zoomable={true}
            collapsible={true}
          />
        </div>
      </div>
      <MemberDetailModal
        open={modalOpen}
        onClose={closeModal}
        node={selectedNode}
      />
    </div>
  );
}
