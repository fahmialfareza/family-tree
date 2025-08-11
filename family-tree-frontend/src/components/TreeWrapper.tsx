"use client";

import React, { useRef } from "react";
import Tree, { RawNodeDatum } from "react-d3-tree";
import * as htmlToImage from "html-to-image";

export interface FamilyTreeNode {
  _id: string;
  name: string;
  children: FamilyTreeNode[];
}

const renderRectSvgNode = ({
  nodeDatum,
  toggleNode,
}: {
  nodeDatum: RawNodeDatum;
  toggleNode: () => void;
}) => {
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
        onClick={toggleNode}
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

export default function TreeWrapper({ data }: { data: FamilyTreeNode }) {
  const treeRef = useRef<HTMLDivElement>(null);

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
            renderCustomNodeElement={renderRectSvgNode}
            zoomable={true}
            collapsible={true}
          />
        </div>
      </div>
    </div>
  );
}
