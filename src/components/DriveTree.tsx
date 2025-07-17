
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";
import { DriveService, DriveFile } from "@/services/driveService";
import { GoogleAccount } from "@/services/googleAuth";
import { Folder, File, Plus, Trash2, FolderPlus, ChevronRight, ChevronDown } from "lucide-react";

interface DriveTreeProps {
  account: GoogleAccount;
  isBackup?: boolean;
  onFileMove?: (fileId: string, targetFolderId: string, targetAccountId: string) => void;
  onRefresh?: () => void;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size?: number;
  mimeType: string;
  modifiedTime: string;
  children?: TreeNode[];
  expanded?: boolean;
  path: string;
  parentId?: string;
}

export const DriveTree = ({ account, isBackup = false, onFileMove, onRefresh }: DriveTreeProps) => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const { toast } = useToast();
  const [driveService] = useState(new DriveService());

  useEffect(() => {
    loadTreeData();
  }, [account]);

  const loadTreeData = async () => {
    setLoading(true);
    try {
      const files = await driveService.getFiles(account.id);
      const tree = buildFileTree(files);
      setTreeData(tree);
    } catch (error) {
      console.error('Error loading tree data:', error);
      toast({
        title: "Error",
        description: "Failed to load files",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const buildFileTree = (files: DriveFile[]): TreeNode[] => {
    const nodeMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    // Create nodes for all files and folders
    files.forEach(file => {
      const node: TreeNode = {
        id: file.id,
        name: file.name,
        type: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
        size: file.size,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        children: [],
        expanded: false,
        path: file.name,
        parentId: file.parentId
      };
      nodeMap.set(file.id, node);
    });

    // Build hierarchy
    nodeMap.forEach(node => {
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children = parent.children || [];
        parent.children.push(node);
        node.path = `${parent.path}/${node.name}`;
      } else {
        rootNodes.push(node);
      }
    });

    // Sort nodes: folders first, then files
    const sortNodes = (nodes: TreeNode[]) => {
      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    };

    const applySortRecursively = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.children) {
          node.children = applySortRecursively(sortNodes(node.children));
        }
      });
      return nodes;
    };

    return applySortRecursively(sortNodes(rootNodes));
  };

  const toggleNode = (nodeId: string) => {
    const updateNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: updateNodes(node.children) };
        }
        return node;
      });
    };
    setTreeData(updateNodes(treeData));
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    // Check for duplicate names
    const parentNode = findNodeById(createParentId || 'root');
    const siblings = parentNode?.children || treeData;
    const isDuplicate = siblings.some(child => 
      child.name.toLowerCase() === newFolderName.toLowerCase()
    );

    if (isDuplicate) {
      toast({
        title: "Error",
        description: "A folder with this name already exists",
        variant: "destructive"
      });
      return;
    }

    try {
      await driveService.createFolder(newFolderName, account.id, createParentId);
      setNewFolderName("");
      setShowCreateDialog(false);
      setCreateParentId(null);
      await loadTreeData();
      onRefresh?.();
      toast({
        title: "Success",
        description: "Folder created successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (nodeId: string, isFolder: boolean) => {
    try {
      if (isFolder) {
        await driveService.deleteFolder(nodeId, account.id);
      } else {
        await driveService.deleteFile(nodeId, account.id);
      }
      await loadTreeData();
      onRefresh?.();
      toast({
        title: "Success",
        description: `${isFolder ? 'Folder' : 'File'} deleted successfully`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to delete ${isFolder ? 'folder' : 'file'}`,
        variant: "destructive"
      });
    }
  };

  const findNodeById = (nodeId: string | null): TreeNode | null => {
    if (!nodeId || nodeId === 'root') return null;
    
    const search = (nodes: TreeNode[]): TreeNode | null => {
      for (const node of nodes) {
        if (node.id === nodeId) return node;
        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return search(treeData);
  };

  const handleDragStart = (e: React.DragEvent, nodeId: string, nodeName: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      sourceAccountId: account.id,
      fileId: nodeId,
      fileName: nodeName
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (onFileMove && data.sourceAccountId !== account.id) {
        onFileMove(data.fileId, targetFolderId, account.id);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  const renderNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const isSelected = selectedNode === node.id;
    const paddingLeft = `${level * 20 + 8}px`;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-1 px-2 hover:bg-gray-50 cursor-pointer ${
            isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''
          }`}
          style={{ paddingLeft }}
          onClick={() => setSelectedNode(node.id)}
          draggable={node.type === 'file' || !isBackup}
          onDragStart={(e) => handleDragStart(e, node.id, node.name)}
          onDragOver={node.type === 'folder' ? handleDragOver : undefined}
          onDrop={node.type === 'folder' ? (e) => handleDrop(e, node.id) : undefined}
        >
          {node.type === 'folder' && (
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-4 w-4"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
            >
              {node.expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          )}
          
          {node.type === 'folder' ? (
            <Folder className="h-4 w-4 text-blue-600" />
          ) : (
            <File className="h-4 w-4 text-gray-600" />
          )}
          
          <span className="flex-1 text-sm truncate">{node.name}</span>
          
          {node.type === 'file' && (
            <span className="text-xs text-gray-500">{formatBytes(node.size || 0)}</span>
          )}
          
          <div className="flex gap-1">
            {node.type === 'folder' && (
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateParentId(node.id);
                  setShowCreateDialog(true);
                }}
              >
                <FolderPlus className="h-3 w-3" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-red-600 hover:text-red-800"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(node.id, node.type === 'folder');
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        {node.type === 'folder' && node.expanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Loading files...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            {account.email} ({isBackup ? 'Backup' : 'Primary'})
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreateParentId(null);
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 h-96 overflow-y-auto">
        {treeData.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No files found
          </div>
        ) : (
          <div className="space-y-1">
            {treeData.map(node => renderNode(node))}
          </div>
        )}
      </CardContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateFolder}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
