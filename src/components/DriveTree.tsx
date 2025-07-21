import "../styles/global.css";
import "../styles/drive-tree.css";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";
import { DriveService, DriveFile } from "@/services/driveService";
import { GoogleAccount } from "@/services/googleAuth";
import { Folder, File, Plus, Trash2, FolderPlus, ChevronRight, ChevronDown, Eye } from "lucide-react";

interface DriveTreeProps {
  account: GoogleAccount;
  onFileSelect?: (file: DriveFile) => void;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  mimeType: string;
  children?: TreeNode[];
  thumbnailUrl?: string;
  createdTime: string;
  accountId: string;
  isChildrenLoaded?: boolean;
}

export const DriveTree = ({ account, onFileSelect }: DriveTreeProps) => {
  const [files, setFiles] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);

  const driveService = new DriveService();
  const { toast } = useToast();

  useEffect(() => {
    // Reset and load root files when account changes
    setFiles([]);
    setExpandedFolders(new Set());
    loadFiles();
  }, [account.id]);

  const loadFiles = async (folderId?: string) => {
    try {
      setLoading(folderId ? false : true); // Only show main loading for root
      setError(null);
      
      const fetchedFiles = await driveService.getFiles(account.id, folderId);
      
      const treeNodes: TreeNode[] = fetchedFiles.map(file => ({
        id: file.id,
        name: file.name,
        type: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
        size: file.size,
        mimeType: file.mimeType,
        children: file.mimeType === 'application/vnd.google-apps.folder' ? [] : undefined,
        thumbnailUrl: file.thumbnailUrl,
        createdTime: file.createdTime,
        accountId: file.accountId,
        isChildrenLoaded: false // Track if children have been loaded
      }));
      
      if (folderId) {
        // Update children of specific folder
        setFiles(prevFiles => updateTreeChildren(prevFiles, folderId, treeNodes));
      } else {
        // Set root files
        setFiles(treeNodes);
      }
    } catch (err) {
      console.error('Error loading files:', err);
      setError('Failed to load files. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateTreeChildren = (nodes: TreeNode[], folderId: string, children: TreeNode[]): TreeNode[] => {
    return nodes.map(node => {
      if (node.id === folderId) {
        return { ...node, children, isChildrenLoaded: true };
      }
      if (node.children) {
        return { ...node, children: updateTreeChildren(node.children, folderId, children) };
      }
      return node;
    });
  };

  const handleFolderToggle = (folderId: string) => {
    if (expandedFolders.has(folderId)) {
      const newExpanded = new Set(expandedFolders);
      newExpanded.delete(folderId);
      setExpandedFolders(newExpanded);
    } else {
      const newExpanded = new Set(expandedFolders);
      newExpanded.add(folderId);
      setExpandedFolders(newExpanded);
      
      // Load folder contents if not already loaded
      const folderNode = findNodeById(files, folderId);
      if (folderNode && !folderNode.isChildrenLoaded) {
        loadFiles(folderId);
      }
    }
  };

  const findNodeById = (nodes: TreeNode[], nodeId: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.children) {
        const found = findNodeById(node.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    try {
      await driveService.createFolder(newFolderName, account.id, currentParentId || undefined);
      setNewFolderName("");
      setCurrentParentId(null);
      
      // Refresh the appropriate folder
      if (currentParentId) {
        loadFiles(currentParentId);
      } else {
        loadFiles();
      }
      
      toast({
        title: "Success",
        description: "Folder created successfully",
      });
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive",
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await driveService.deleteFile(fileId, account.id);
      loadFiles(); // Refresh root files
      toast({
        title: "Success",
        description: "File deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: "Error",
        description: "Failed to delete file",
        variant: "destructive",
      });
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await driveService.deleteFolder(folderId, account.id);
      loadFiles(); // Refresh root files
      toast({
        title: "Success",
        description: "Folder deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast({
        title: "Error",
        description: "Failed to delete folder",
        variant: "destructive",
      });
    }
  };

  const handleFilePreview = (node: TreeNode) => {
    const file: DriveFile = {
      id: node.id,
      name: node.name,
      mimeType: node.mimeType,
      size: node.size,
      createdTime: node.createdTime,
      modifiedTime: node.createdTime,
      accountId: node.accountId,
      thumbnailUrl: node.thumbnailUrl
    };
    
    setSelectedFile(file);
    if (onFileSelect) {
      onFileSelect(file);
    }
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    
    return (
      <div key={node.id} className="drive-tree-node-container">
        <div 
          className="drive-tree-node"
          style={{ paddingLeft: `${depth * 20}px` }}
        >
          <div className="drive-tree-node-content">
            <button
              onClick={() => handleFolderToggle(node.id)}
              className="drive-tree-expand-button"
            >
              {expandedFolders.has(node.id) ? (
                <ChevronDown className="drive-tree-node-icon" />
              ) : (
                <ChevronRight className="drive-tree-node-icon" />
              )}
            </button>

            <div className="drive-tree-node-icon">
              {node.type === 'folder' ? (
                <Folder className="h-4 w-4 text-blue-500" />
              ) : node.thumbnailUrl ? (
                <img 
                  src={node.thumbnailUrl} 
                  alt={node.name}
                  className="tree-file-thumbnail"
                />
              ) : (
                <File className="h-4 w-4 text-gray-500" />
              )}
            </div>

            <span className="drive-tree-node-name">{node.name}</span>

            {node.type === 'file' && (
              <span className="drive-tree-node-size">{formatBytes(node.size)}</span>
            )}
          </div>

          <div className="drive-tree-node-actions">
            {node.type === 'file' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFilePreview(node)}
                className="drive-tree-action-button"
              >
                <Eye className="h-3 w-3" />
              </Button>
            )}

            {node.type === 'folder' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentParentId(node.id)}
                className="drive-tree-action-button"
              >
                <FolderPlus className="h-3 w-3" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => node.type === 'folder' ? handleDeleteFolder(node.id) : handleDeleteFile(node.id)}
              className="drive-tree-action-button text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {node.children && expandedFolders.has(node.id) && (
          <div className="drive-tree-children">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading files...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={() => loadFiles()} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Drive Files</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentParentId(null)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Folder
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No files found in this account</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {files.map(node => renderTreeNode(node))}
          </div>
        )}

        {currentParentId !== null && (
          <Dialog open={true} onOpenChange={() => setCurrentParentId(null)}>
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
                  <Button 
                    variant="outline" 
                    onClick={() => setCurrentParentId(null)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateFolder}
                    disabled={isCreatingFolder || !newFolderName.trim()}
                  >
                    {isCreatingFolder ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
};