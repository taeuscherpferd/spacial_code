use super::*;
use std::{convert::Infallible, time::Duration};

fn message_sink() -> (
    impl Sink<Message, Error = Infallible> + Unpin + Send,
    mpsc::UnboundedReceiver<Message>,
) {
    let (sender, messages) = mpsc::unbounded_channel();
    let sink = Box::pin(futures_util::sink::unfold(
        sender,
        |sender, message| async move {
            sender.send(message).unwrap();
            Ok::<_, Infallible>(sender)
        },
    ));
    (sink, messages)
}

#[tokio::test]
async fn dropped_broadcasts_close_the_connection_before_forwarding_remaining_events() {
    let (broadcasts, receiver) = broadcast::channel(2);
    let (_responses, response_events) = mpsc::unbounded_channel();
    let (sender, mut messages) = message_sink();
    for index in 0..3 {
        broadcasts
            .send(SpatialEvent::TerminalOutput {
                data: index.to_string(),
            })
            .unwrap();
    }
    tokio::time::timeout(
        Duration::from_secs(1),
        forward_events(sender, receiver, response_events),
    )
    .await
    .unwrap();
    assert!(matches!(messages.recv().await, Some(Message::Close(None))));
    assert!(messages.recv().await.is_none());
}

#[tokio::test]
async fn forwards_broadcasts_in_order_and_private_responses() {
    let (broadcasts, receiver) = broadcast::channel(2);
    let (responses, response_events) = mpsc::unbounded_channel();
    let (sender, mut messages) = message_sink();
    for data in ["first", "second"] {
        broadcasts
            .send(SpatialEvent::TerminalOutput { data: data.into() })
            .unwrap();
    }
    let outgoing = tokio::spawn(forward_events(sender, receiver, response_events));
    for data in ["first", "second"] {
        let message = tokio::time::timeout(Duration::from_secs(1), messages.recv())
            .await
            .unwrap()
            .unwrap();
        let Message::Text(json) = message else {
            panic!("expected text event")
        };
        let event: SpatialEvent = serde_json::from_str(&json).unwrap();
        assert!(matches!(event, SpatialEvent::TerminalOutput { data: actual } if actual == data));
    }
    responses
        .send(SpatialEvent::Error {
            message: "private response".into(),
        })
        .unwrap();
    let message = tokio::time::timeout(Duration::from_secs(1), messages.recv())
        .await
        .unwrap()
        .unwrap();
    let Message::Text(json) = message else {
        panic!("expected private response")
    };
    let event: SpatialEvent = serde_json::from_str(&json).unwrap();
    assert!(matches!(event, SpatialEvent::Error { message } if message == "private response"));
    drop(responses);
    tokio::time::timeout(Duration::from_secs(1), outgoing)
        .await
        .unwrap()
        .unwrap();
}
