"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  Row,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleXIcon,
  Columns3Icon,
  EllipsisIcon,
  FilterIcon,
  ListFilterIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TPerson } from "@/models/person";
import Link from "next/link";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import useStore from "@/zustand";
import { addFamily } from "@/service/family";
import { deletePerson } from "@/service/person";
import DialogDelete from "./DialogDelete";
import PhotoModal from "./PhotoModal";

const multiColumnFilterFn: FilterFn<TPerson> = (row, columnId, filterValue) => {
  const relationships =
    row.original.relationships
      ?.map((rel) => {
        if (!rel.toDetails) return "";
        return `${rel.type} ${rel.toDetails.nickname || ""} ${
          rel.toDetails.name || ""
        }`;
      })
      .join(" ") ?? "";

  const searchableRowContent =
    `${row.original.name} ${row.original.nickname} ${row.original.address} ${row.original.gender} ${row.original.birthDate} ${relationships}`.toLowerCase();

  const searchTerm = (filterValue ?? "").toLowerCase();
  return searchableRowContent.includes(searchTerm);
};

const statusFilterFn: FilterFn<TPerson> = (
  row,
  columnId,
  filterValue: string[]
) => {
  if (!filterValue?.length) return true;
  const status = row.getValue(columnId) as string;
  return filterValue.includes(status);
};

const columns: ColumnDef<TPerson>[] = [
  {
    header: "Nickname",
    accessorKey: "nickname",
    filterFn: multiColumnFilterFn,
  },
  {
    header: "Name",
    accessorKey: "name",
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("name")}</div>
    ),
    size: 180,
    filterFn: multiColumnFilterFn,
    enableHiding: false,
  },
  {
    header: "Address",
    accessorKey: "address",
    filterFn: multiColumnFilterFn,
  },
  {
    header: "Status",
    accessorKey: "status",
    filterFn: statusFilterFn,
  },
  {
    header: "Gender",
    accessorKey: "gender",
    filterFn: multiColumnFilterFn,
  },
  {
    header: "Relationship",
    cell: ({ row }) => {
      const relationships = row.original.relationships;
      if (!relationships || relationships.length === 0) return null;

      return (
        <ul className="list-disc ps-4 space-y-1">
          {relationships.map((rel) => {
            if (!rel.toDetails) return null;
            let label = "";
            if (rel.type === "spouse") {
              if (row.original.gender === "male") {
                label = `Husband of ${
                  rel.toDetails.nickname || rel.toDetails.name
                }`;
              } else if (row.original.gender === "female") {
                label = `Wife of ${
                  rel.toDetails.nickname || rel.toDetails.name
                }`;
              } else {
                label = `Spouse of ${
                  rel.toDetails.nickname || rel.toDetails.name
                }`;
              }
            } else if (rel.type === "parent") {
              if (row.original.gender === "male") {
                label = `Dad of ${
                  rel.toDetails.nickname || rel.toDetails.name
                }`;
              } else if (row.original.gender === "female") {
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
            return <li key={rel._id}>{label}</li>;
          })}
        </ul>
      );
    },
    filterFn: multiColumnFilterFn,
  },
  {
    header: "Phone",
    accessorKey: "phone",
    filterFn: multiColumnFilterFn,
  },
  {
    header: "Birth Date",
    accessorKey: "birthDate",
    cell: ({ row }) => {
      const value = row.getValue("birthDate");
      if (!value) return null;
      const date = new Date(value as string);
      if (isNaN(date.getTime())) return value;
      return (
        <div>
          {date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      );
    },
    size: 180,
  },
  {
    header: "Photo",
    accessorKey: "photoUrl",
    cell: ({ row }) => <PhotoCell row={row} />,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <RowActions row={row} />,
    size: 60,
    enableHiding: false,
  },
];

export default function PersonTable({ data }: { data: TPerson[] }) {
  const id = useId();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "name",
      desc: false,
    },
  ]);

  const handleDeleteRows = () => {
    // TODO: Delete data
    table.resetRowSelection();
  };

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    state: {
      sorting,
      pagination,
      columnFilters,
      columnVisibility,
    },
  });

  const uniqueStatusValues = useMemo(() => {
    const statusColumn = table.getColumn("status");

    if (!statusColumn) return [];

    const values = Array.from(statusColumn.getFacetedUniqueValues().keys());

    return values.sort();
  }, [table.getColumn("status")?.getFacetedUniqueValues()]);

  const statusCounts = useMemo(() => {
    const statusColumn = table.getColumn("status");
    if (!statusColumn) return new Map();
    return statusColumn.getFacetedUniqueValues();
  }, [table.getColumn("status")?.getFacetedUniqueValues()]);

  const selectedStatuses = useMemo(() => {
    const filterValue = table.getColumn("status")?.getFilterValue() as string[];
    return filterValue ?? [];
  }, [table.getColumn("status")?.getFilterValue()]);

  const handleStatusChange = (checked: boolean, value: string) => {
    const filterValue = table.getColumn("status")?.getFilterValue() as string[];
    const newFilterValue = filterValue ? [...filterValue] : [];

    if (checked) {
      newFilterValue.push(value);
    } else {
      const index = newFilterValue.indexOf(value);
      if (index > -1) {
        newFilterValue.splice(index, 1);
      }
    }

    table
      .getColumn("status")
      ?.setFilterValue(newFilterValue.length ? newFilterValue : undefined);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
        <div className="flex items-center gap-3 max-sm:flex-wrap max-sm:gap-2">
          {/* Filter by name or nickname */}
          <div className="relative max-sm:w-full">
            <Input
              id={`${id}-input`}
              ref={inputRef}
              className={cn(
                "peer min-w-60 ps-9 max-sm:min-w-0 max-sm:w-full",
                Boolean(table.getColumn("name")?.getFilterValue()) && "pe-9"
              )}
              value={
                // Show the value from either filter, prefer name if both are set
                (table.getColumn("name")?.getFilterValue() as string) ??
                (table.getColumn("nickname")?.getFilterValue() as string) ??
                ""
              }
              onChange={(e) => {
                table.getColumn("name")?.setFilterValue(e.target.value);
                table.getColumn("nickname")?.setFilterValue(e.target.value);
              }}
              placeholder="Filter by name or nickname"
              type="text"
              aria-label="Filter by name or nickname"
            />
            <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
              <ListFilterIcon size={16} aria-hidden="true" />
            </div>
            {(Boolean(table.getColumn("name")?.getFilterValue()) ||
              Boolean(table.getColumn("nickname")?.getFilterValue())) && (
              <button
                className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Clear filter"
                onClick={() => {
                  table.getColumn("name")?.setFilterValue("");
                  table.getColumn("nickname")?.setFilterValue("");
                  if (inputRef.current) {
                    inputRef.current.focus();
                  }
                }}
              >
                <CircleXIcon size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          {/* Filter by status */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <FilterIcon
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true"
                />
                Status
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-36 p-3" align="start">
              <div className="space-y-3">
                <div className="text-muted-foreground text-xs font-medium">
                  Filters
                </div>
                <div className="space-y-3">
                  {uniqueStatusValues.map((value, i) => (
                    <div key={value} className="flex items-center gap-2">
                      <Checkbox
                        id={`${id}-${i}`}
                        checked={selectedStatuses.includes(value)}
                        onCheckedChange={(checked: boolean) =>
                          handleStatusChange(checked, value)
                        }
                      />
                      <Label
                        htmlFor={`${id}-${i}`}
                        className="flex grow justify-between gap-2 font-normal"
                      >
                        {value}{" "}
                        <span className="text-muted-foreground ms-2 text-xs">
                          {statusCounts.get(value)}
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {/* Toggle columns visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3Icon
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true"
                />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-3">
          {/* Delete button */}
          {table.getSelectedRowModel().rows.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="ml-auto" variant="outline">
                  <TrashIcon
                    className="-ms-1 opacity-60"
                    size={16}
                    aria-hidden="true"
                  />
                  Delete
                  <span className="bg-background text-muted-foreground/70 -me-1 inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium">
                    {table.getSelectedRowModel().rows.length}
                  </span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <div className="flex flex-col gap-2 max-sm:items-center sm:flex-row sm:gap-4">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border"
                    aria-hidden="true"
                  >
                    <CircleAlertIcon className="opacity-80" size={16} />
                  </div>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete{" "}
                      {table.getSelectedRowModel().rows.length} selected{" "}
                      {table.getSelectedRowModel().rows.length === 1
                        ? "row"
                        : "rows"}
                      .
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteRows}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Link href={"/person/create"}>
            <Button className="ml-auto" variant="outline">
              <PlusIcon
                className="-ms-1 opacity-60"
                size={16}
                aria-hidden="true"
              />
              Add person
            </Button>
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="bg-background overflow-hidden rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: `${header.getSize()}px` }}
                      className="h-11"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <div
                          className={cn(
                            header.column.getCanSort() &&
                              "flex h-full cursor-pointer items-center justify-between gap-2 select-none"
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            if (
                              header.column.getCanSort() &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {{
                            asc: (
                              <ChevronUpIcon
                                className="shrink-0 opacity-60"
                                size={16}
                                aria-hidden="true"
                              />
                            ),
                            desc: (
                              <ChevronDownIcon
                                className="shrink-0 opacity-60"
                                size={16}
                                aria-hidden="true"
                              />
                            ),
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="last:py-0">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Results per page */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Label htmlFor={id} className="sr-only">
            Rows per page
          </Label>
          <Select
            value={table.getState().pagination.pageSize.toString()}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger
              id={id}
              className="w-full sm:w-24 min-w-0 px-2 py-1 text-sm border rounded-md bg-background"
            >
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 25, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize} rows
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Page info and pagination controls */}
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:items-center sm:gap-4">
          {/* Page number information */}
          <span className="text-muted-foreground text-sm whitespace-nowrap text-center sm:text-left">
            <span className="font-semibold text-foreground">
              {table.getRowModel().rows.length === 0
                ? 0
                : table.getState().pagination.pageIndex *
                    table.getState().pagination.pageSize +
                  1}
              -
              {Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                table.getRowCount()
              )}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-foreground">
              {table.getRowCount().toString()}
            </span>
          </span>

          {/* Pagination buttons */}
          <div className="flex justify-center w-full flex-wrap gap-1 sm:justify-end">
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full"
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Go to first page"
            >
              <ChevronFirstIcon size={18} aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Go to previous page"
            >
              <ChevronLeftIcon size={18} aria-hidden="true" />
            </Button>
            <span className="inline-flex items-center px-2 text-sm font-medium text-foreground bg-muted rounded">
              {table.getState().pagination.pageIndex + 1}
              <span className="mx-1 text-muted-foreground">/</span>
              {table.getPageCount()}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Go to next page"
            >
              <ChevronRightIcon size={18} aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full"
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Go to last page"
            >
              <ChevronLastIcon size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowActions({ row }: { row: Row<TPerson> }) {
  const router = useRouter();
  const { token, user } = useStore();
  const [openDelete, setOpenDelete] = useState(false);

  const handleDelete = async () => {
    const { data, message } = await deletePerson(row.original._id, token);
    if (!data) {
      toast.error(message);
      return;
    }
    toast.success("Person deleted successfully");
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex justify-end">
            <Button
              size="icon"
              variant="ghost"
              className="shadow-none"
              aria-label="Edit item"
            >
              <EllipsisIcon size={16} aria-hidden="true" />
            </Button>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Family Tree</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <Link href={`/tree/${row.original._id}?mode=parent`}>
                    <DropdownMenuItem>
                      <span>As Parent</span>
                      <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </Link>
                  <Link href={`/tree/${row.original._id}?mode=child`}>
                    <DropdownMenuItem>
                      <span>As Child</span>
                      <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </Link>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <Link href={`/person/edit/${row.original._id}`}>
              <DropdownMenuItem>
                <span>Edit</span>
                <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
              </DropdownMenuItem>
            </Link>
            <Link href={`/relationship/${row.original._id}`}>
              <DropdownMenuItem>
                <span>Edit Relationship</span>
                <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
              </DropdownMenuItem>
            </Link>
            {user?.role === "admin" && (
              <Link href={`/person/ownership/${row.original._id}`}>
                <DropdownMenuItem>
                  <span>Edit Ownership</span>
                  <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
                </DropdownMenuItem>
              </Link>
            )}
            <DropdownMenuItem
              onClick={async () => {
                const { data, message } = await addFamily(
                  {
                    name: row.original.name,
                    person: row.original._id,
                  },
                  token
                );
                if (!data) {
                  toast.error(message);
                  return;
                }
                toast.success("Family group created successfully");
                router.push("/family");
              }}
            >
              <span>Make as Family Group</span>
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Share to WhatsApp</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = `${window.location.origin}/tree/${row.original._id}?mode=parent`;
                      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
                        url
                      )}`;
                      window.open(whatsappUrl, "_blank");
                    }}
                  >
                    As Parent
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = `${window.location.origin}/tree/${row.original._id}?mode=child`;
                      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
                        url
                      )}`;
                      window.open(whatsappUrl, "_blank");
                    }}
                  >
                    As Child
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setOpenDelete(true)}
          >
            <span>Delete</span>
            <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogDelete
        open={openDelete}
        type="person"
        setOpen={setOpenDelete}
        onConfirm={handleDelete}
      />
    </>
  );
}

function PhotoCell({ row }: { row: Row<TPerson> }) {
  const value = row.getValue("photoUrl") as string | undefined;
  const [open, setOpen] = useState(false);

  if (!value) return null;
  return (
    <>
      <div className="flex justify-center">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          type="button"
        >
          See Photo
        </Button>
      </div>
      {open && (
        <PhotoModal
          image={value}
          name={row.getValue("name")}
          setOpen={setOpen}
        />
      )}
    </>
  );
}
