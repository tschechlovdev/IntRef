from collections import deque
from typing import List, Tuple
import paho.mqtt.client as mqtt
import json
import threading
from ClusterTree.Tree import Tree
import pandas as pd

# list with all active connected sessions
sessions: List[Tuple[Tree, threading.Lock, deque]] = []

# Thread management on session instance level to ensure orderly computation of request for each session
def manage_tasks(instance_id):
    try:
        acquired = get_session_lock(instance_id).acquire(timeout=5)
        if acquired:
            taskqueue = get_session_deque(instance_id)
            while len(taskqueue) > 0:
                t = taskqueue.popleft()
                t.start()
                t.join()
            get_session_lock(instance_id).release()
    except Exception as e:
        print(e)
        get_session_lock(instance_id).release()

#creates new session
def new_session(instance_id: str):
    global sessions
    global client
    tree = Tree(instance_id)
    tree.setClient(client)
    sessions.append((tree, threading.Lock(),  deque()))
    return get_session(instance_id)


def get_session(instance_id):
    """Gets session by id

    Args:
        instance_id (str): id

    Returns:
        Tuple[Tree, threading.Lock, deque]: Corresponding session information
    """
    global sessions
    for i in range(0, len(sessions)):
        if sessions[i][0].instance_id == instance_id:
            return sessions[i]
    return new_session(instance_id)

def get_session_tree(instance_id) -> Tree:
    global sessions
    return get_session(instance_id)[0]

def get_session_lock(instance_id) -> threading.Lock:
    global sessions
    return get_session(instance_id)[1]

def get_session_deque(instance_id) -> deque:
    global sessions
    return get_session(instance_id)[2]

#cluster related Methods
def register_root(msg):
    """Register new root node to initialize tree

    Args:
        msg: root node info
    """
    print("registered root node")
    instance_id = msg["instance_id"]
    root_id = msg["root_id"]
    tree = get_session_tree(instance_id)
    tree.setRoot(root_id)

def config_datasc_algo(msg):
    """Configure cluster session configuration (algorithm, data source, ...)

    Args:
        msg (str): json string from frontend containing config information
    """
    instance_id = msg["instance_id"]
    datasc = msg["data_source"]
    #algorithm to use
    algorithm = msg["algorithm"]
    #separator to use
    separator = msg["separator"]
    tree = get_session_tree(instance_id)
    tree.setInitialConfig(algorithm, datasc, separator)
    tree.loadData()
    tree.calculateClusters()

def add_node(msg):
    """adds new node to tree
    """
    print("add node node name")
    instance_id = msg["instance_id"]
    #id of new node
    node_id = msg["node_id"]
    #name of new node
    node_name = msg["node_name"]
    #id of parent node
    parent_id = msg["parent_id"]
    #flag to track if tree should be recalculated
    immidiate_calc = msg["immidiate_calc"]
    tree = get_session_tree(instance_id)
    tree.getNodeById(parent_id).addChild(node_id, node_name)
    if tree.data != None and immidiate_calc:
        tree.getNodeById(parent_id).calculate_cluster()

def re_cluster(msg):
    """exec recluster operation
    """
    print("recalculating_cluster")
    instance_id = msg["instance_id"]
    #node id to which recluster is applied
    node_id = msg["node_id"]
    tree = get_session_tree(instance_id)
    tree.getNodeById(node_id).re_cluster()

def remove_node(msg):
    """removes node from tree
    """
    print("remove node from tree")
    instance_id = msg["instance_id"]
    #id of node to remove
    node_id = msg["node_id"]
    tree = get_session_tree(instance_id)
    parent = tree.getNodeById(node_id).get_parent()
    parent.remove_child(node_id)
    # if tree.data != None and immidiate_calc:
    #     tree.getNodeById(parent_id).calculate_cluster()

def set_attribute_weights(msg):
    """set attribute weights of a node"""
    instance_id = msg["instance_id"]
    #target node id
    node_id = msg["node_id"]
    #new attribute weights
    att_weights = msg["att_weights"]
    tree = get_session_tree(instance_id)
    node = tree.getNodeById(node_id)
    node.set_attribute_weights(att_weights)

def set_node_restrictions(msg):
    """set hierarchical restriction on node content"""
    instance_id = msg["instance_id"]
    #target node id
    node_id = msg["node_id"]
    #restrictions to apply
    restrictions = msg["restrictions"]
    tree = get_session_tree(instance_id)
    node = tree.getNodeById(node_id)
    node.set_hier_restrictions(restrictions)


def rename_node(msg):
    """change the name of a node"""
    print("rename node")
    instance_id = msg["instance_id"]
    #target node id
    node_id = msg["node_id"]
    #target node name
    new_name = msg["new_name"]
    tree = get_session_tree(instance_id)
    tree.getNodeById(node_id).setName(new_name)

def get_data_table(msg):
    """retrieves content of node and sends data to frontend to create the table representation"""
    instance_id = msg["instance_id"]
    #target node
    node_id = msg["node_id"]
    tree = get_session_tree(instance_id)
    node = tree.getNodeById(node_id)
    # try:
    to_send = node.get_data_table_data()
    data = {"instance_id": tree.instance_id,
    "node_id": node.id,
    "table_data": to_send,
    }
    client.publish("clustering_communicator/frontend/get_data_table",
            json.dumps(data), qos=2)
    # except Exception as e:
    #     print("exception")
    #     print(e)

def reassign_instance_clust(msg):
    """manually reassign data instance to cluster"""
    instance_id = msg["instance_id"]
    #target node id
    node_id = msg["node_id"]
    #cluster data instance should be assigned to            
    assigned_clust_id = msg["assigned_cluster"]
    #unique row id of data instance
    row_id = msg["backend_row_id"]
    tree = get_session_tree(instance_id)
    assigned_clust = tree.getNodeById(assigned_clust_id)
    assigned_clust.assign_row_to_cluster(row_id)
    node = tree.getNodeById(node_id)
    node.calculate_cluster()

def get_clust_result(msg):
    """retrieves clustering result and sends summary to frontend to update ui"""
    instance_id = msg["instance_id"]
    tree = get_session_tree(instance_id)
    #get each result cluster with corresponsing label
    df_list = []
    for leaf_node in [node for node in tree.flatten() if node.is_leaf_node()]:
        df_list.append(leaf_node.data.get_df_clabel(leaf_node.name))
    res_data = pd.concat(df_list).to_csv(index=False)
    #send results to frontend to download
    client.publish("clustering_communicator/frontend/get_clust_result",
        json.dumps({"data": res_data,
        "instance_id": instance_id}), qos=2)

def request_active_query(msg):
    """requests active query for frontend"""
    instance_id = msg["instance_id"]
    node_id = msg["node_id"]
    tree = get_session_tree(instance_id)
    node = tree.getNodeById(node_id)
    query = node.get_active_query()
    if query != None:
        #get data of query
        qi0, qi1 = tree.data.get_unique_row_id_index(query[0]), tree.data.get_unique_row_id_index(query[1])
        q0, q1 = tree.data.df.iloc[qi0].values.tolist()[:-1], tree.data.df.iloc[qi1].values.tolist()[:-1]
        q0t, q1t = tree.data.unencoded_df.iloc[qi0].values.tolist()[:-1], tree.data.unencoded_df.iloc[qi1].values.tolist()[:-1]
        #hack for numpy tolist() not working as expected with mixed column data (does only convert some datatypes to native python for some reason)
        #--> convert other items manually
        for i in range(len(q0t)):
            try:
                q0t[i] = q0t[i].item()
                q1t[i] = q1t[i].item()
            except:
                pass
        #send info to compare to frontend
        data = {"instance_id": instance_id,
            "node_id": node.id,
            "query_id": [qi0, qi1],
            "query_data": [q0t,q1t],
            }
        client.publish("clustering_communicator/frontend/request_active_query",
            json.dumps(data), qos=2)


def q_answer(msg):
    """process the answer to a previous active query"""
    instance_id = msg["instance_id"]
    node_id = msg["node_id"]
    q_answ = msg["q_answer"]
    tree = get_session_tree(instance_id)
    node = tree.getNodeById(node_id)
    #answer query
    node.answer_act_query(q_answ)
    #request next query to represent to domain expert
    request_active_query(msg)

def adjust_node(msg):
    pass

def get_graph_data(msg):
    """get data to create a graph representation of node content in frontend"""
    instance_id = msg["instance_id"]
    #target node id
    node_id = msg["selected_node_id"]
    #type of graph that should be created
    vis_type = msg["type"]
    attribute = msg["attribute"]
    version = msg["version"]
    cluster = msg["cluster"]
    tree = get_session_tree(instance_id)
    node = tree.getNodeById(node_id)
    #check if selected node exists and has data
    if node == None or node.data == None or len(node.data.get_data()) == 0:
        return None
    if vis_type == 'coordinates':
        # Publish data for parallel coordinate plot
        attributes = node.data.get_attributes_of_dataset_clabel()
        # client.publish("clustering_communicator/frontend/graph_data",
        #              json.dumps([dc[m_id].get_data_without_noise(), attributes, msg['type'], m_id]),
        #             qos=2)
        data_list = node.get_clusters_coords_format()
        #for serializability convert to normal python list
        data_list = list(map(lambda x: list(x), data_list))
        data = {"instance_id": instance_id,
            "data": data_list,
            "version": version,
            "vis_type": vis_type,
            "attributes": attributes
        }
        client.publish("clustering_communicator/frontend/graph_data",
                        json.dumps(data),
                        qos=2)
    else:
        # Publish data for histogram
        try:
            clu_val, cla_val = tree.getNodeById(cluster).data.get_attribute_values_for_cluster(attribute)
            att_range = tree.getNodeById(cluster).data.get_attribute_range(attribute)
            data = {"instance_id": instance_id,
                "clu_val": clu_val,
                "cla_val": cla_val,
                "version": version,
                "vis_type": vis_type,
                "att_range": att_range,
                "attribute": attribute,
                }
            client.publish("clustering_communicator/frontend/graph_data",
                            json.dumps(data), qos=2)
        except Exception as e:
                print("exception in get graph")


# MQTT
def on_mqtt_connect(client, userdata, flags, rc):
    print("Connected to MQTT Broker")


def on_log(client, userdata, level, buff):
    print(buff)


def on_mqtt_disconnect(client, userdata, rc):
    print("Disconnected from MQTT Broker")

def on_mqtt_message(client, userdata, msg):
    print("new message")
    # print(msg.topic)
    payload = json.loads(msg.payload.decode('UTF-8'))
    # print(msg.payload)
    if msg.topic == "clustering_communicator/backend/register_root":
        t = threading.Thread(target=register_root, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/add_node":
        t = threading.Thread(target=add_node, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/change_name":
        t = threading.Thread(target=rename_node, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/config_datasc_algo":
        t = threading.Thread(target=config_datasc_algo, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/get_graph":
        if not "id" in payload:
            t = threading.Thread(target=get_graph_data, args=(payload,))
            instance_id = payload["instance_id"]
            get_session_deque(instance_id).append(t)
            threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/re_cluster":
        t = threading.Thread(target=re_cluster, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/remove_node":
        t = threading.Thread(target=remove_node, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/set_attribute_weights":
        t = threading.Thread(target=set_attribute_weights, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/set_node_restrictions":
        t = threading.Thread(target=set_node_restrictions, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/get_data_table":
        t = threading.Thread(target=get_data_table, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/reassign_instance_clust":
        t = threading.Thread(target=reassign_instance_clust, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/request_active_query":
        t = threading.Thread(target=request_active_query, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/q_answer":
        t = threading.Thread(target=q_answer, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    elif msg.topic == "clustering_communicator/backend/get_clust_result":
        t = threading.Thread(target=get_clust_result, args=(payload,))
        instance_id = payload["instance_id"]
        get_session_deque(instance_id).append(t)
        threading.Thread(target=manage_tasks, args=(payload["instance_id"],)).start()
    else:
        print("not implemented topic" + msg.topic + " " + str(msg.payload))



client = mqtt.Client()
client.on_connect = on_mqtt_connect
client.on_disconnect = on_mqtt_disconnect
client.on_message = on_mqtt_message
client.on_log = on_log

client.connect("129.69.209.180", 1883, 60)

# subscribe
client.subscribe("clustering_communicator/backend/#")
client.loop_forever()



afads.append("ds<sf")
















import paho.mqtt.client as mqtt
import utils as ih

import json

from FeatureFinder.methods import features_differentiating_cluster, get_overall_relevant_features, \
    relevant_feature_per_cluster, get_attribute_thresholds
from data_container import DataContainer

dc = {}


# MQTT
def on_mqtt_connect(client, userdata, flags, rc):
    print("Connected to MQTT Broker")


def on_log(client, userdata, level, buff):
    print(buff)


def on_mqtt_disconnect(client, userdata, rc):
    print("Disconnected from MQTT Broker")


def on_mqtt_message(client, userdata, msg):
    print("new message")
    payload = json.loads(msg.payload.decode('UTF-8'))
    if msg.topic == "clustering_communicator/backend/method1":
        feature_method1(payload)
    elif msg.topic == "clustering_communicator/backend/method2":
        feature_method2(payload)
    elif msg.topic == "clustering_communicator/backend/method3":
        feature_method3(payload)
    elif msg.topic == "clustering_communicator/backend/modified_method3":
        modified_method3(payload)
    elif msg.topic == "clustering_communicator/backend/attributes":
        get_attributes(payload)
    elif msg.topic == "clustering_communicator/backend/get_graph":
        get_graph_data(payload)
    else:
        print("not implemented topic" + msg.topic + " " + str(msg.payload))


def feature_method1(msg):
    """
    Gets the relevant Features per cluster for a dataset
    :param msg: the dataset and its separator, as well as the clustering algorithm and its parameters
    :return: Publishes the relevant features per cluster as a list, the majority label of each cluster and the ground truth and cluster labels
    """

    setup_Container(msg)
    m_id = int(msg["id"])
    header = dc[m_id].get_header()
    clu = dc[m_id].get_clustering_result()

    rel_feat = relevant_feature_per_cluster(clu, header)
    labels = dc[m_id].get_majority_labels()
    nr_instances = dc[m_id].get_nr_instances_per_cluster()
    client.publish("clustering_communicator/frontend/method1",
                   json.dumps([msg['algorithm'], labels, nr_instances, rel_feat, m_id]), qos=2)
    print("Feature Method 1 - Relevant Features Per Cluster")


def feature_method2(msg):
    """
    Computes the features that differentiate each cluster for a given dataset
    :param msg: the dataset and its separator, as well as the clustering algorithm and its parameters
    :return: Publishes the features that differentiate each cluster
    """

    setup_Container(msg)
    m_id = int(msg["id"])
    header = dc[m_id].get_header()
    clu = dc[m_id].get_clustering_result()

    rel_feat, thresholds = features_differentiating_cluster(clu, header)
    labels = dc[m_id].get_majority_labels()
    nr_instances = dc[m_id].get_nr_instances_per_cluster()
    client.publish("clustering_communicator/frontend/method2",
                   json.dumps([msg['algorithm'], labels, nr_instances, rel_feat, thresholds, m_id]), qos=2)
    print("Feature Method 2 - Feature differentiating Cluster")


def feature_method3(msg):
    """
    Computes the relevant features over all cluster
    :param msg: the dataset and its separator, as well as the clustering algorithm and its parameters
    :return: Publishes the Relevant Features over all Cluster and the thresholds for each feature, the majority label of each cluster and the ground truth and cluster labels
    """

    # Setup
    setup_Container(msg)
    m_id = int(msg["id"])
    header = dc[m_id].get_header()
    clu = dc[m_id].get_clustering_result()

    # Compute Method 3
    rel_feat, thresholds = get_overall_relevant_features(clu, header)
    labels = dc[m_id].get_majority_labels()
    nr_instances = dc[m_id].get_nr_instances_per_cluster()
    # Publish
    client.publish("clustering_communicator/frontend/method3",
                   json.dumps([msg['algorithm'], labels, nr_instances, rel_feat, thresholds, m_id]), qos=2)
    print("Feature Method 3 - Relevant Features over all Cluster")


def modified_method3(msg):
    """
    Computes the relevant features over all cluster and the thresholds of additional attributes
    :param msg: the dataset and its separator, as well as the clustering algorithm and its parameters
                and additional attributes
    :return: Publishes the Relevant Features over all Cluster and the thresholds for each feature
             and the same for the additionally provided attributes, the majority label of each cluster and the ground truth and cluster labels
    """

    # Setup
    setup_Container(msg)
    m_id = int(msg["id"])
    header = dc[m_id].get_header()
    clu = dc[m_id].get_clustering_result()

    # Compute Method 3
    rel_feat, thresholds = get_overall_relevant_features(clu, header)
    # Get additional attribute thresholds
    attributes = msg['addAttr']
    add_thresholds = get_attribute_thresholds(clu, attributes, header)
    labels = dc[m_id].get_majority_labels()
    nr_instances = dc[m_id].get_nr_instances_per_cluster()
    # Publish
    client.publish("clustering_communicator/frontend/modified_method3",
                   json.dumps([msg['algorithm'], labels, nr_instances, rel_feat, thresholds, attributes, add_thresholds,
                               m_id]), qos=2)
    print("Modified Feature Method 3 - Relevant Features over all Cluster")


def get_attributes(msg):
    """
    Gets the header of the current dataset
    :param msg: the dataset and the separator of the dataset
    :return: Publishes the header of the dataset
    """
    attributes = ih.get_attributes_of_dataset(msg['dataset'], msg['separator'])
    reason = 'graph' if msg['reason'] == 'graph' else 'method3'
    client.publish("clustering_communicator/frontend/attributes", json.dumps([attributes, reason]), qos=2)


def get_graph_data(msg):
    """
    :param msg: 
    :return: 
    """
    m_id = int(msg["id"])
    if m_id not in dc:
        # No current data. Publish no data
        client.publish("clustering_communicator/frontend/graph_data", json.dumps([[], [], 0]), qos=2)
    else:
        if msg['type'] == 'coordinates':
            # Publish data for parallel coordinate plot
            attributes = dc[m_id].get_attributes_of_dataset()
            # client.publish("clustering_communicator/frontend/graph_data",
            #              json.dumps([dc[m_id].get_data_without_noise(), attributes, msg['type'], m_id]),
            #             qos=2)
            client.publish("clustering_communicator/frontend/graph_data",
                           json.dumps([dc[m_id].get_data(), attributes, msg['type'], m_id]),
                           qos=2)
        else:
            # Publish data for histogram
            clu_val, cla_val = dc[m_id].get_attribute_values_for_cluster(msg['attribute'], msg['cluster'],
                                                                         msg['type'])
            client.publish("clustering_communicator/frontend/graph_data",
                           json.dumps([clu_val, cla_val, msg['type'], msg['attribute'],
                                       dc[m_id].get_attribute_range(msg['attribute']), m_id]), qos=2)


def setup_Container(msg):
    global dc
    m_id = int(msg["id"])
    # Check if the wanted dataset+cluster combination is already stored, if not create it
    if m_id not in dc or dc[m_id].get_configuration()[0] != msg['dataset'] or dc[m_id].get_configuration()[1] != msg[
        'algorithm'] or \
            dc[m_id].get_configuration()[2] != msg['param']:
        dc[m_id] = DataContainer(msg['dataset'], msg['algorithm'], msg['param'], msg['separator'], m_id)  # TODO


client = mqtt.Client()
client.on_connect = on_mqtt_connect
client.on_disconnect = on_mqtt_disconnect
client.on_message = on_mqtt_message
client.on_log = on_log

client.connect("129.69.209.180", 1883, 60)

# subscribe
client.subscribe("clustering_communicator/backend/#")
client.loop_forever()
