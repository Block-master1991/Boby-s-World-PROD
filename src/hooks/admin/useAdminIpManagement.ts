"use client";

import { db } from "@/lib/firebase/firebase";
import { logger } from "@/utils/logger";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import { useCallback, useState } from "react";

export interface IpEntry {
  ip: string;
  addedAt?: string;
}

interface IpManagementActions {
  setLoading: (l: boolean) => void;
  setMessage: (m: { type: "success" | "error"; text: string } | null) => void;
  refresh: () => Promise<void>;
}

const PAGE_SIZE = 20;

export function useAdminIpManagement() {
  const [whitelist, setWhitelist] = useState<IpEntry[]>([]);
  const [blacklist, setBlacklist] = useState<IpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [whitePage, setWhitePage] = useState(1);
  const [blackPage, setBlackPage] = useState(1);

  const fetchLists = useCallback(async (search = "") => {
    setLoading(true);
    try {
      const { whitelist: wl, blacklist: bl } = await loadIpLists(search);
      setWhitelist(wl);
      setBlacklist(bl);
    } catch (error) {
      logger.error("Error fetching lists:", error as Error);
      setMessage({ type: "error", text: "Failed to fetch lists." });
    } finally {
      setLoading(false);
    }
  }, []);

  function getPaginatedList(listType: "whitelist" | "blacklist") {
    const list = listType === "whitelist" ? whitelist : blacklist;
    const page = listType === "whitelist" ? whitePage : blackPage;
    return list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  const actions: IpManagementActions = { setLoading, setMessage, refresh: fetchLists };

  return {
    whitelist,
    blacklist,
    loading,
    message,
    setMessage,
    fetchLists,
    whitePage,
    setWhitePage,
    blackPage,
    setBlackPage,
    getPaginatedList,
    PAGE_SIZE,
    addIp: (ip: string, list: "whitelist" | "blacklist", onSuccess?: () => void) =>
      handleAddIp(ip, list, actions, onSuccess),
    deleteIp: (ip: string, list: "whitelist" | "blacklist") => handleDeleteIp(ip, list, actions),
  };
}

// --- Helper Functions ---

async function loadIpLists(search: string) {
  const [whiteSnap, blackSnap] = await Promise.all([
    getDocs(query(collection(db, "ratelimit_whitelist"), orderBy("addedAt", "desc"))),
    getDocs(query(collection(db, "ratelimit_blacklist"), orderBy("addedAt", "desc"))),
  ]);

  const processList = (docs: QueryDocumentSnapshot<DocumentData>[]) =>
    docs.map(formatDoc).filter(item => !search || item.ip.includes(search));

  return { whitelist: processList(whiteSnap.docs), blacklist: processList(blackSnap.docs) };
}

function formatDoc(docSnap: QueryDocumentSnapshot<DocumentData>): IpEntry {
  const data = docSnap.data();
  let addedAtStr = "";
  // Safe bracket access for index signature compliance
  if (data?.["addedAt"]?.toDate) {
    addedAtStr = data["addedAt"].toDate().toLocaleString();
  } else if (typeof data?.["addedAt"] === "string") {
    addedAtStr = new Date(data["addedAt"]).toLocaleString();
  }
  return { ip: docSnap.id, addedAt: addedAtStr };
}

async function handleAddIp(
  ip: string,
  targetList: "whitelist" | "blacklist",
  actions: IpManagementActions,
  onSuccess?: () => void
) {
  if (!ip.match(/^(\d{1,3}\.){3}\d{1,3}$/)) {
    actions.setMessage({ type: "error", text: "Invalid IP address." });
    return;
  }
  actions.setLoading(true);
  try {
    await setDoc(doc(db, `ratelimit_${targetList}`, ip), { addedAt: new Date() });
    actions.setMessage({ type: "success", text: `IP (${ip}) added to ${targetList}.` });
    await actions.refresh();
    onSuccess?.();
  } catch {
    actions.setMessage({ type: "error", text: "Failed to add IP." });
  } finally {
    actions.setLoading(false);
  }
}

async function handleDeleteIp(
  ip: string,
  list: "whitelist" | "blacklist",
  actions: IpManagementActions
) {
  actions.setLoading(true);
  try {
    await deleteDoc(doc(db, `ratelimit_${list}`, ip));
    actions.setMessage({ type: "success", text: `IP (${ip}) removed from ${list}.` });
    await actions.refresh();
  } catch {
    actions.setMessage({ type: "error", text: "Failed to remove IP." });
  } finally {
    actions.setLoading(false);
  }
}
