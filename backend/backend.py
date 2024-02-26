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
