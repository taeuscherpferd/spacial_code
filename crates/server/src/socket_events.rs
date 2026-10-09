use crate::session::SpatialEvent;
use axum::extract::ws::Message;
use futures_util::{Sink, SinkExt};
use tokio::sync::{broadcast, mpsc};

pub async fn forward_events<S>(
    mut sender: S,
    mut broadcasts: broadcast::Receiver<SpatialEvent>,
    mut responses: mpsc::UnboundedReceiver<SpatialEvent>,
) where
    S: Sink<Message> + Unpin,
{
    loop {
        let event = tokio::select! {
            event = broadcasts.recv() => match event {
                Ok(event) => event,
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    let _ = sender.send(Message::Close(None)).await;
                    break;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
            event = responses.recv() => match event {
                Some(event) => event,
                None => break,
            },
        };
        let Ok(json) = serde_json::to_string(&event) else {
            continue;
        };
        if sender.send(Message::Text(json.into())).await.is_err() {
            break;
        }
    }
}

#[cfg(test)]
#[path = "socket_events_tests.rs"]
mod tests;
