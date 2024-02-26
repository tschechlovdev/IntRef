from typing import List

from data_container import DataContainer
from .TreeNode import TreeNode
import paho.mqtt.client as mqtt

class Tree:
    """Tree representation of hierarchical cluster model.
    """

    def __init__(self, instance_id):
        self.instance_id = instance_id
        self.root: TreeNode
        self.client: mqtt.client
        #clustering algorithm initial implementaion only provides pckmeans
        self.algorithm: str
        #data used for clustering
        self.data_source: str = None
        self.data: DataContainer = None
        self.separator: str

    def getNodeById(self, id) -> TreeNode:
        """Get node of tree by id"""
        for node in self.flatten():
            if node.id == id:
                return node
        return None

    def setRoot(self, rootID):
        """set root node of tree"""
        self.root = TreeNode(self, rootID, name=rootID)

    def setClient(self, client):
        """set mqtt client"""
        self.client = client

    def setInitialConfig(self, algorithm, data_source, separator):
        """set configuration used for clustering"""
        self.algorithm = algorithm
        self.data_source = data_source
        self.separator = separator
    
    def loadData(self):
        """load data into tree"""
        self.data = self.setup_Container()
        self.data.init_from_file()
        self.root.data = self.data

    def calculateClusters(self):
        """calculate cluster content of every tree node"""
        self.root.calculate_cluster()

    def flatten(self) -> List[TreeNode]:
        """get flat representation of tree containing all nodes"""
        return Tree.recursiveGetChildren(self.root)

    def recursiveGetChildren(start_node: TreeNode, include_start_node: bool = True) -> List[TreeNode]:
        """recursively get all children"""
        temp = []
        if include_start_node:
            temp.append(start_node)
        for child in start_node.get_children():
            temp += Tree.recursiveGetChildren(child, True)
        return temp

    def setup_Container(self) -> DataContainer:
        """setup a new data container"""
        return DataContainer(self.data_source, self.algorithm, self.separator)
