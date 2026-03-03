/* eslint-disable react-refresh/only-export-components */
import { useState, useMemo, useCallback, useEffect } from "react";
import { FileText, ChevronRight, ChevronDown, Clock } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Document } from "@/types";

// 文档树节点数据结构
interface DocumentTreeNode {
  id: number;
  topic: string;
  created_at: string;
  children: DocumentTreeNode[];
}

interface DocumentTreeProps {
  documents: Document[];
  selectedDocumentId: number | null;
  isStreaming: boolean;
  onDocumentSelect: (documentId: number) => void;
}

// 找到文档的顶级根节点 ID（沿着 parent_document_id 一直往上找）
// 使用迭代而非递归，避免栈溢出风险
// 导出以供其他组件使用
export function findRootId(
  docId: number,
  docMap: Map<number, Document>,
  maxDepth = 100
): number | null {
  let currentId = docId;
  let depth = 0;

  while (depth < maxDepth) {
    const doc = docMap.get(currentId);
    if (!doc) return null;
    if (!doc.parent_document_id) return doc.id;
    currentId = doc.parent_document_id;
    depth++;
  }

  // 深度超限 - 返回 null 表示可能存在数据损坏（循环引用）
  return null;
}

// 构建扁平化的文档树结构（所有子文档都挂在顶级文档下）
// O(n) 复杂度：使用 childrenMap 批量添加子节点，避免 O(n²) 的多次 findRootId 调用
function buildDocumentTree(documents: Document[]): DocumentTreeNode[] {
  const docMap = new Map<number, Document>();
  const rootNodes: DocumentTreeNode[] = [];
  const rootNodeMap = new Map<number, DocumentTreeNode>();
  const childrenMap = new Map<number, Document[]>();

  // 构建 docMap 并分离根节点和子文档
  documents.forEach((doc) => {
    docMap.set(doc.id, doc);
    if (!doc.parent_document_id) {
      const node: DocumentTreeNode = {
        id: doc.id,
        topic: doc.topic,
        created_at: doc.created_at,
        children: [],
      };
      rootNodes.push(node);
      rootNodeMap.set(doc.id, node);
    } else {
      const parentId = doc.parent_document_id;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(doc);
    }
  });

  // 一次性将所有子文档添加到对应的根节点
  childrenMap.forEach((children, rootId) => {
    const rootNode = rootNodeMap.get(rootId);
    if (rootNode) {
      rootNode.children = children.map((child) => ({
        id: child.id,
        topic: child.topic,
        created_at: child.created_at,
        children: [],
      }));
    }
  });

  // 按创建时间排序（新的在前）
  rootNodes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  rootNodes.forEach((node) => {
    node.children.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

  return rootNodes;
}

// 检查节点或其子节点是否被选中
function isNodeOrChildrenSelected(node: DocumentTreeNode, selectedId: number | null): boolean {
  if (selectedId === null) return false;
  if (node.id === selectedId) return true;
  return node.children.some((child) => child.id === selectedId);
}

export function DocumentTree({
  documents,
  selectedDocumentId,
  isStreaming,
  onDocumentSelect,
}: DocumentTreeProps) {
  // 构建文档树
  const documentTree = useMemo(() => buildDocumentTree(documents), [documents]);

  // 记录展开的节点ID
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  // 初始化：默认展开所有有子节点的根节点
  // 当文档数组变化时（新增文档），自动展开包含子文档的根节点
  useEffect(() => {
    setExpandedNodes((prev) => {
      const newExpanded = new Set(prev);
      documentTree.forEach((node) => {
        // 如果根节点有子文档，保持展开状态
        if (node.children.length > 0) {
          newExpanded.add(node.id);
        }
      });
      return newExpanded;
    });
  }, [documents, documentTree]);

  // 切换展开/收起状态
  const toggleExpanded = useCallback((nodeId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  // 格式化日期
  const formatDate = useCallback((dateString: string) => {
    try {
      const normalized = dateString.endsWith("Z") ? dateString : dateString + "Z";
      return format(new Date(normalized), "MM-dd HH:mm", { locale: zhCN });
    } catch {
      return "";
    }
  }, []);

  // 渲染单个文档项
  const renderDocumentItem = (node: DocumentTreeNode, level: number = 0): React.ReactNode => {
    const isRoot = level === 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedDocumentId === node.id;
    const hasChildren = node.children.length > 0;
    const isChildSelected =
      hasChildren && !isExpanded && isNodeOrChildrenSelected(node, selectedDocumentId);

    return (
      <div key={node.id} className="w-full">
        {/* 文档项按钮 */}
        <button
          onClick={() => !isStreaming && onDocumentSelect(node.id)}
          disabled={isStreaming}
          className={cn(
            "group w-full rounded-md text-left text-sm transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "px-2 py-2",
            isSelected
              ? "bg-accent font-medium text-accent-foreground"
              : isChildSelected
                ? "bg-accent/50 text-accent-foreground/90"
                : "text-foreground hover:bg-accent hover:text-accent-foreground",
            isStreaming && "cursor-not-allowed opacity-50",
            !isRoot && "ml-4 border-l border-border/50 pl-3"
          )}
        >
          <div className="flex items-start gap-2">
            {/* 展开/收起按钮区域 - 仅根文档且有子文档时显示 */}
            {isRoot && hasChildren ? (
              <button
                onClick={(e) => toggleExpanded(node.id, e)}
                className={cn(
                  "mt-0.5 flex-shrink-0 rounded-sm p-0.5 transition-colors",
                  "hover:bg-accent-foreground/10",
                  isSelected || isChildSelected
                    ? "text-accent-foreground"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
                title={isExpanded ? "收起" : "展开"}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <div className="w-5 flex-shrink-0" />
            )}

            {/* 文档图标 */}
            <FileText
              className={cn(
                "mt-0.5 h-4 w-4 flex-shrink-0",
                isSelected
                  ? "text-primary"
                  : isChildSelected
                    ? "text-primary/70"
                    : "text-muted-foreground group-hover:text-foreground"
              )}
            />

            {/* 文档信息 */}
            <div className="min-w-0 flex-1">
              <p className="truncate leading-tight">{node.topic}</p>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatDate(node.created_at)}</span>
              </div>
            </div>
          </div>
        </button>

        {/* 子文档列表 */}
        {isRoot && hasChildren && isExpanded && (
          <div className="mt-0.5">
            {node.children.map((child) => renderDocumentItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (documents.length === 0) {
    return (
      <div className="mt-2 rounded-md bg-muted/50 px-2 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground/80">暂无文档</p>
        <p className="mt-1 text-xs">在聊天中生成第一个文档</p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1">{documentTree.map((node) => renderDocumentItem(node))}</div>
  );
}
