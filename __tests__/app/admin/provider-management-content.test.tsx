import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockListAdminProvidersAction = vi.fn();
const mockGetProviderDetailAction = vi.fn();
const mockReplaceProviderArtifactAction = vi.fn();
const mockDeleteProviderVersionAction = vi.fn();

const sampleProvider = {
  namespace: "hashicorp",
  type: "aws",
  latestVersion: "1.0.0",
  revision: 5,
  etag: 'W/"5"',
  protocols: ["5.0"],
  versionCount: 1,
  totalPlatforms: 1,
  publishedAt: new Date("2025-01-01T00:00:00Z"),
};

vi.mock("@/app/actions/admin-providers", () => ({
  createProviderAction: vi.fn(),
  deleteProviderAction: vi.fn(),
  deleteProviderVersionAction: (...args: unknown[]) =>
    mockDeleteProviderVersionAction(...args),
  editProviderMetadataAction: vi.fn(),
  getProviderDetailAction: (...args: unknown[]) =>
    mockGetProviderDetailAction(...args),
  listAdminProvidersAction: (...args: unknown[]) =>
    mockListAdminProvidersAction(...args),
  renameProviderAction: vi.fn(),
  replaceProviderArtifactAction: (...args: unknown[]) =>
    mockReplaceProviderArtifactAction(...args),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span />,
  Plug: () => <span />,
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

vi.mock("@/components/admin/provider-table", () => ({
  ProviderTable: ({
    onReplaceArtifact,
    onViewVersions,
  }: {
    onReplaceArtifact: (provider: typeof sampleProvider) => void;
    onViewVersions: (provider: typeof sampleProvider) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onReplaceArtifact(sampleProvider)}>
        open-replace
      </button>
      <button type="button" onClick={() => onViewVersions(sampleProvider)}>
        open-versions
      </button>
    </div>
  ),
}));

vi.mock("@/components/admin/replace-artifact-dialog", () => ({
  ReplaceArtifactDialog: ({
    open,
    onConfirm,
    versions,
  }: {
    open: boolean;
    onConfirm: (version: string, artifact: File) => Promise<void>;
    versions: string[];
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          void onConfirm(versions[0]!, new File(["zip"], "provider.zip")).catch(
            () => undefined,
          )
        }
      >
        confirm-replace
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

vi.mock("@/components/admin/create-provider-dialog", () => ({
  CreateProviderDialog: () => null,
}));
vi.mock("@/components/admin/delete-provider-dialog", () => ({
  DeleteProviderDialog: () => null,
}));
vi.mock("@/components/admin/edit-provider-dialog", () => ({
  EditProviderDialog: () => null,
}));
vi.mock("@/components/admin/provider-details-dialog", () => ({
  ProviderDetailsDialog: () => null,
}));
vi.mock("@/components/admin/rename-dialog", () => ({
  RenameDialog: () => null,
}));

import { ProviderManagementContent } from "@/app/(protected)/admin/providers/provider-management-content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function renderComponent(): Promise<void> {
  await act(async () => {
    root.render(<ProviderManagementContent />);
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

describe("ProviderManagementContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockListAdminProvidersAction.mockResolvedValue({
      success: true,
      data: { items: [sampleProvider], total: 1, page: 1, totalPages: 1 },
    });
    mockGetProviderDetailAction.mockResolvedValue({
      success: true,
      data: {
        namespace: sampleProvider.namespace,
        type: sampleProvider.type,
        protocols: sampleProvider.protocols,
        versions: [
          {
            id: 1,
            version: sampleProvider.latestVersion,
            revision: sampleProvider.revision,
            etag: sampleProvider.etag,
            protocols: sampleProvider.protocols,
            platforms: [
              {
                os: "linux",
                arch: "amd64",
                filename: "terraform-provider-aws.zip",
                shasum:
                  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            ],
            gpgKeys: [],
            publishedAt: sampleProvider.publishedAt,
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

  it("shows stale revision alert when artifact replacement hits conflict", async () => {
    await renderComponent();

    mockReplaceProviderArtifactAction.mockResolvedValue({
      success: false,
      code: "CONFLICT",
      error:
        "This provider was changed by another admin. Refresh the list and try again.",
    });

    await click("open-replace");

    await waitFor(() => {
      expect(getButton("confirm-replace")).toBeTruthy();
    });

    await click("confirm-replace");

    await waitFor(() => {
      expect(container.textContent).toContain("Stale revision detected");
      expect(container.textContent).toContain("changed by another admin");
    });
  });

  it("surfaces provider version delete errors from admin action", async () => {
    await renderComponent();

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockDeleteProviderVersionAction.mockResolvedValue({
      success: false,
      code: "NOT_FOUND",
      error: "Provider version not found",
    });

    await click("open-versions");

    await waitFor(() => {
      expect(getButton("delete-version")).toBeTruthy();
    });

    await click("delete-version");

    await waitFor(() => {
      expect(container.textContent).toContain("Stale revision detected");
      expect(container.textContent).toContain("Provider version not found");
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows unauthorized list error UI and allows retry", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockListAdminProvidersAction.mockReset();
    mockListAdminProvidersAction
      .mockResolvedValueOnce({
        success: false,
        code: "UNAUTHORIZED",
        error: "Unauthorized",
      })
      .mockResolvedValue({
        success: true,
        data: { items: [sampleProvider], total: 1, page: 1, totalPages: 1 },
      });

    await renderComponent();

    await waitFor(() => {
      expect(container.textContent).toContain("Unable to load providers");
      expect(container.textContent).toContain(
        "You are not authorized to load providers",
      );
      expect(getButton("Retry")).toBeTruthy();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();

    const callsBeforeRetry = mockListAdminProvidersAction.mock.calls.length;
    await click("Retry");

    await waitFor(() => {
      expect(mockListAdminProvidersAction.mock.calls.length).toBeGreaterThan(
        callsBeforeRetry,
      );
      expect(container.textContent).not.toContain("Unable to load providers");
    });
  });

  it("shows load error UI when list action fails with unknown error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockListAdminProvidersAction.mockReset();
    mockListAdminProvidersAction.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN",
      error: "Registry backend unavailable",
    });

    await renderComponent();

    await waitFor(() => {
      expect(container.textContent).toContain("Unable to load providers");
      expect(container.textContent).toContain("Registry backend unavailable");
      expect(getButton("Retry")).toBeTruthy();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
