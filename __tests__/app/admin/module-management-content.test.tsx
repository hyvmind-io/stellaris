import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockListAdminModulesAction = vi.fn();
const mockGetModuleDetailAction = vi.fn();
const mockEditModuleMetadataAction = vi.fn();
const mockDeleteModuleVersionAction = vi.fn();

const sampleModule = {
  namespace: "hashicorp",
  name: "consul",
  provider: "aws",
  description: "desc",
  latestVersion: "1.0.0",
  revision: 4,
  etag: 'W/"4"',
  versionCount: 1,
  totalDownloads: 100,
  publishedAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

vi.mock("@/app/actions/admin-modules", () => ({
  createModuleAction: vi.fn(),
  deleteModuleAction: vi.fn(),
  deleteModuleVersionAction: (...args: unknown[]) =>
    mockDeleteModuleVersionAction(...args),
  editModuleMetadataAction: (...args: unknown[]) =>
    mockEditModuleMetadataAction(...args),
  getModuleDetailAction: (...args: unknown[]) =>
    mockGetModuleDetailAction(...args),
  listAdminModulesAction: (...args: unknown[]) =>
    mockListAdminModulesAction(...args),
  renameModuleAction: vi.fn(),
  replaceModuleArtifactAction: vi.fn(async () => ({
    success: false,
    error: "Artifact replacement is unavailable",
  })),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span />,
  Package: () => <span />,
  Search: () => <span />,
  X: () => <span />,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (e: { target: { value: string } }) => void;
  }) => (
    <input
      value={value}
      onChange={(event) =>
        onChange({ target: { value: event.currentTarget.value } })
      }
    />
  ),
}));

vi.mock("@/components/admin/module-table", () => ({
  ModuleTable: ({
    onEditModule,
    onViewVersions,
  }: {
    onEditModule: (module: typeof sampleModule) => void;
    onViewVersions: (module: typeof sampleModule) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onEditModule(sampleModule)}>
        open-edit
      </button>
      <button type="button" onClick={() => onViewVersions(sampleModule)}>
        open-versions
      </button>
    </div>
  ),
}));

vi.mock("@/components/admin/edit-module-dialog", () => ({
  EditModuleDialog: ({
    module,
    open,
    onConfirm,
  }: {
    module: typeof sampleModule | null;
    open: boolean;
    onConfirm: (
      namespace: string,
      name: string,
      provider: string,
      data: {
        version: string;
        description: string;
        source: string;
        owner: string;
        tags: string;
      },
    ) => Promise<void>;
  }) =>
    open && module ? (
      <button
        type="button"
        onClick={() =>
          void onConfirm(module.namespace, module.name, module.provider, {
            version: module.latestVersion,
            description: "new description",
            source: "src",
            owner: "owner",
            tags: "aws,gcp",
          }).catch(() => undefined)
        }
      >
        confirm-edit
      </button>
    ) : null,
}));

vi.mock("@/components/admin/version-history-dialog", () => ({
  VersionHistoryDialog: ({
    open,
    onDeleteVersion,
    versions,
  }: {
    open: boolean;
    onDeleteVersion: (version: string, revision: number) => void;
    versions: Array<{ version: string; revision: number }>;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onDeleteVersion(versions[0]!.version, versions[0]!.revision)
        }
      >
        delete-version
      </button>
    ) : null,
}));

vi.mock("@/components/admin/create-module-dialog", () => ({
  CreateModuleDialog: () => null,
}));
vi.mock("@/components/admin/delete-module-dialog", () => ({
  DeleteModuleDialog: () => null,
}));
vi.mock("@/components/admin/module-details-dialog", () => ({
  ModuleDetailsDialog: () => null,
}));
vi.mock("@/components/admin/rename-dialog", () => ({
  RenameDialog: () => null,
}));
vi.mock("@/components/admin/replace-artifact-dialog", () => ({
  ReplaceArtifactDialog: () => null,
}));

import { ModuleManagementContent } from "@/app/(protected)/admin/modules/module-management-content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function renderComponent(): Promise<void> {
  await act(async () => {
    root.render(<ModuleManagementContent />);
  });
  await flush();
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(check: () => void, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (true) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await flush();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

async function click(label: string): Promise<void> {
  await act(async () => {
    getButton(label).click();
  });
  await flush();
}

describe("ModuleManagementContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockListAdminModulesAction.mockResolvedValue({
      success: true,
      data: { items: [sampleModule], total: 1, page: 1, totalPages: 1 },
    });
    mockGetModuleDetailAction.mockResolvedValue({
      success: true,
      data: {
        namespace: sampleModule.namespace,
        name: sampleModule.name,
        provider: sampleModule.provider,
        description: sampleModule.description,
        source: "https://github.com/hashicorp/consul",
        owner: "hashicorp",
        tags: ["aws"],
        versions: [
          {
            id: 1,
            version: sampleModule.latestVersion,
            revision: sampleModule.revision,
            etag: sampleModule.etag,
            description: sampleModule.description,
            source: "https://github.com/hashicorp/consul",
            owner: "hashicorp",
            downloads: 100,
            location: "modules/hashicorp/consul/aws/1.0.0.tgz",
            publishedAt: sampleModule.publishedAt,
          },
        ],
      },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows stale revision alert for edit conflicts and refreshes list", async () => {
    await renderComponent();

    mockEditModuleMetadataAction.mockResolvedValue({
      success: false,
      code: "CONFLICT",
      error:
        "This module was changed by another admin. Refresh the list and try again.",
    });

    await click("open-edit");
    await click("confirm-edit");

    await waitFor(() => {
      expect(container.textContent).toContain("Stale revision detected");
      expect(container.textContent).toContain("changed by another admin");
    });

    const callsBeforeRefresh = mockListAdminModulesAction.mock.calls.length;
    await click("Refresh Data");

    await waitFor(() => {
      expect(mockListAdminModulesAction.mock.calls.length).toBeGreaterThan(
        callsBeforeRefresh,
      );
    });
  });

  it("surfaces non-conflict errors when deleting a module version", async () => {
    await renderComponent();

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockDeleteModuleVersionAction.mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: "Module version not found",
    });

    await click("open-versions");

    await waitFor(() => {
      expect(getButton("delete-version")).toBeTruthy();
    });

    await click("delete-version");

    await waitFor(() => {
      expect(container.textContent).toContain("Stale revision detected");
      expect(container.textContent).toContain("Module version not found");
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows unauthorized list error UI and allows retry", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockListAdminModulesAction.mockReset();
    mockListAdminModulesAction
      .mockResolvedValueOnce({
        success: false,
        code: "UNAUTHORIZED",
        error: "Unauthorized",
      })
      .mockResolvedValue({
        success: true,
        data: { items: [sampleModule], total: 1, page: 1, totalPages: 1 },
      });

    await renderComponent();

    await waitFor(() => {
      expect(container.textContent).toContain("Unable to load modules");
      expect(container.textContent).toContain(
        "You are not authorized to load modules",
      );
      expect(getButton("Retry")).toBeTruthy();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();

    const callsBeforeRetry = mockListAdminModulesAction.mock.calls.length;
    await click("Retry");

    await waitFor(() => {
      expect(mockListAdminModulesAction.mock.calls.length).toBeGreaterThan(
        callsBeforeRetry,
      );
      expect(container.textContent).not.toContain("Unable to load modules");
    });
  });

  it("shows load error UI when list action fails with unknown error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockListAdminModulesAction.mockReset();
    mockListAdminModulesAction.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN",
      error: "Registry backend unavailable",
    });

    await renderComponent();

    await waitFor(() => {
      expect(container.textContent).toContain("Unable to load modules");
      expect(container.textContent).toContain("Registry backend unavailable");
      expect(getButton("Retry")).toBeTruthy();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
