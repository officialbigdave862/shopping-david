<?php

session_start();

if (!isset($_SESSION["admin_id"])) {
    header("Location: login.php");
    exit;
}

require_once "../api/config.php";

$message = "";
$error = "";


/* =========================
   UPDATE ORDER STATUS
========================= */

if (
    $_SERVER["REQUEST_METHOD"] === "POST" &&
    isset($_POST["update_status"])
) {

    $orderId = intval($_POST["order_id"] ?? 0);
    $status = trim($_POST["status"] ?? "");

    $allowedStatuses = [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled"
    ];

    if (
        $orderId <= 0 ||
        !in_array($status, $allowedStatuses, true)
    ) {

        $error = "Invalid order status.";

    } else {

        $stmt = $conn->prepare(
            "UPDATE orders
             SET status = ?
             WHERE id = ?"
        );

        $stmt->bind_param(
            "si",
            $status,
            $orderId
        );

        if ($stmt->execute()) {

            $message = "Order status updated successfully.";

        } else {

            $error = "Unable to update order status.";

        }

        $stmt->close();
    }
}


/* =========================
   DELETE ORDER
========================= */

if (
    $_SERVER["REQUEST_METHOD"] === "POST" &&
    isset($_POST["delete_order"])
) {

    $orderId = intval($_POST["order_id"] ?? 0);

    if ($orderId > 0) {

        $stmt = $conn->prepare(
            "DELETE FROM orders
             WHERE id = ?"
        );

        $stmt->bind_param(
            "i",
            $orderId
        );

        if ($stmt->execute()) {

            $message = "Order deleted successfully.";

        } else {

            $error = "Unable to delete order.";

        }

        $stmt->close();
    }
}


/* =========================
   SEARCH ORDERS
========================= */

$search = trim($_GET["search"] ?? "");

if (!empty($search)) {

    $searchTerm = "%" . $search . "%";

    $stmt = $conn->prepare(
        "SELECT *
         FROM orders
         WHERE
            CAST(id AS CHAR) LIKE ?
            OR customer_name LIKE ?
            OR email LIKE ?
            OR phone LIKE ?
            OR status LIKE ?
         ORDER BY id DESC"
    );

    $stmt->bind_param(
        "sssss",
        $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm
    );

    $stmt->execute();

    $orders = $stmt->get_result();

} else {

    $orders = $conn->query(
        "SELECT *
         FROM orders
         ORDER BY id DESC"
    );
}


/* =========================
   ORDER ITEMS
========================= */

function getOrderItems($conn, $orderId)
{

    $stmt = $conn->prepare(
        "SELECT
            product_name,
            price,
            quantity
         FROM order_items
         WHERE order_id = ?
         ORDER BY id ASC"
    );

    $stmt->bind_param(
        "i",
        $orderId
    );

    $stmt->execute();

    $result = $stmt->get_result();

    $items = [];

    while ($row = $result->fetch_assoc()) {
        $items[] = $row;
    }

    $stmt->close();

    return $items;
}

?>

<!DOCTYPE html>
<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>
        Orders | SHOPPING DAVID Admin
    </title>

    <style>

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: Arial, sans-serif;
            background: #f5f6f8;
            color: #111;
        }

        .admin-layout {
            display: flex;
            min-height: 100vh;
        }

        /* SIDEBAR */

        .sidebar {
            width: 250px;
            background: #111;
            color: white;
            padding: 25px 18px;
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
        }

        .brand {
            font-size: 22px;
            font-weight: 800;
            padding: 10px;
            margin-bottom: 35px;
        }

        .admin-name {
            font-size: 13px;
            color: #aaa;
            padding: 10px;
            margin-bottom: 15px;
        }

        .sidebar a {
            display: block;
            text-decoration: none;
            color: #ddd;
            padding: 13px 12px;
            border-radius: 8px;
            margin-bottom: 6px;
        }

        .sidebar a:hover,
        .sidebar a.active {
            background: white;
            color: #111;
        }

        .logout {
            margin-top: 30px;
            color: #ffb3b3 !important;
        }

        /* MAIN */

        .main {
            margin-left: 250px;
            width: calc(100% - 250px);
            padding: 30px;
        }

        .topbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
        }

        .topbar h1 {
            font-size: 30px;
        }

        .topbar p {
            color: #777;
            margin-top: 5px;
        }

        .view-store {
            background: #111;
            color: white;
            text-decoration: none;
            padding: 12px 18px;
            border-radius: 8px;
            font-weight: 600;
        }

        /* MESSAGES */

        .message,
        .error {
            padding: 14px 16px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .message {
            background: #e7f7ed;
            color: #176b38;
        }

        .error {
            background: #ffe8e8;
            color: #b00020;
        }

        /* CARD */

        .card {
            background: white;
            border-radius: 14px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow:
                0 5px 20px rgba(0,0,0,0.05);
        }

        .card h2 {
            margin-bottom: 20px;
            font-size: 21px;
        }

        /* SEARCH */

        .search-row {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .search-row input {
            flex: 1;
            margin-top: 0;
            padding: 12px 13px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 15px;
        }

        .search-row input:focus {
            outline: none;
            border-color: #111;
        }

        .btn {
            display: inline-block;
            border: none;
            text-decoration: none;
            background: #111;
            color: white;
            padding: 11px 16px;
            border-radius: 8px;
            font-weight: 700;
            cursor: pointer;
        }

        .btn-secondary {
            background: #eee;
            color: #111;
        }

        /* ORDER */

        .order {
            border: 1px solid #eee;
            border-radius: 12px;
            margin-bottom: 18px;
            overflow: hidden;
        }

        .order-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 18px;
            background: #fafafa;
            border-bottom: 1px solid #eee;
        }

        .order-number {
            font-size: 18px;
            font-weight: 800;
        }

        .order-date {
            color: #777;
            font-size: 13px;
            margin-top: 5px;
        }

        .order-body {
            padding: 20px;
        }

        .customer-grid {
            display: grid;
            grid-template-columns:
                repeat(2, minmax(0, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .customer-box {
            background: #f7f7f7;
            padding: 14px;
            border-radius: 8px;
        }

        .customer-box strong {
            display: block;
            font-size: 12px;
            color: #777;
            margin-bottom: 5px;
        }

        .customer-box span {
            font-size: 14px;
        }

        /* ITEMS */

        .items {
            border-top: 1px solid #eee;
            padding-top: 18px;
        }

        .items h3 {
            font-size: 16px;
            margin-bottom: 12px;
        }

        .item-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        }

        .item-name {
            font-weight: 600;
        }

        .item-meta {
            color: #777;
            font-size: 13px;
            margin-top: 4px;
        }

        .item-price {
            font-weight: 700;
        }

        /* ORDER FOOTER */

        .order-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 15px;
            margin-top: 20px;
            padding-top: 18px;
            border-top: 1px solid #eee;
        }

        .total {
            font-size: 20px;
            font-weight: 800;
        }

        .status-form {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-form select {
            padding: 9px 10px;
            border: 1px solid #ddd;
            border-radius: 7px;
        }

        .status {
            display: inline-block;
            padding: 6px 10px;
            border-radius: 20px;
            background: #eee;
            font-size: 12px;
            font-weight: 700;
        }

        .delete-btn {
            background: #ffe4e4;
            color: #b00020;
            border: none;
            padding: 9px 12px;
            border-radius: 7px;
            cursor: pointer;
            font-weight: 700;
        }

        .empty {
            text-align: center;
            padding: 40px;
            color: #777;
        }

        /* MOBILE */

        @media (max-width: 900px) {

            .sidebar {
                width: 210px;
            }

            .main {
                margin-left: 210px;
                width: calc(100% - 210px);
            }

            .customer-grid {
                grid-template-columns: 1fr;
            }

        }

        @media (max-width: 650px) {

            .admin-layout {
                display: block;
            }

            .sidebar {
                position: relative;
                width: 100%;
            }

            .main {
                margin-left: 0;
                width: 100%;
                padding: 20px;
            }

            .topbar {
                display: block;
            }

            .view-store {
                display: inline-block;
                margin-top: 15px;
            }

            .search-row {
                display: block;
            }

            .search-row .btn {
                margin-top: 10px;
            }

            .order-header,
            .order-footer {
                display: block;
            }

            .status-form {
                margin-top: 15px;
                flex-wrap: wrap;
            }

        }

    </style>

</head>

<body>

<div class="admin-layout">

    <!-- SIDEBAR -->

    <aside class="sidebar">

        <div class="brand">
            SHOPPING DAVID
        </div>

        <div class="admin-name">
            Administrator<br>
            <?= htmlspecialchars(
                $_SESSION["admin_email"]
            ) ?>
        </div>

        <a href="dashboard.php">
            Dashboard
        </a>

        <a href="products.php">
            Products
        </a>

        <a
            href="orders.php"
            class="active"
        >
            Orders
        </a>

        <a
            href="../index.html"
            target="_blank"
        >
            View Store
        </a>

        <a
            href="logout.php"
            class="logout"
        >
            Logout
        </a>

    </aside>


    <!-- MAIN -->

    <main class="main">

        <div class="topbar">

            <div>

                <h1>
                    Orders
                </h1>

                <p>
                    Manage customer orders and delivery status.
                </p>

            </div>

            <a
                href="../index.html"
                target="_blank"
                class="view-store"
            >
                View Store
            </a>

        </div>


        <?php if (!empty($message)): ?>

            <div class="message">
                <?= htmlspecialchars($message) ?>
            </div>

        <?php endif; ?>


        <?php if (!empty($error)): ?>

            <div class="error">
                <?= htmlspecialchars($error) ?>
            </div>

        <?php endif; ?>


        <section class="card">

            <h2>
                Customer Orders
            </h2>


            <!-- SEARCH -->

            <form
                method="GET"
                class="search-row"
            >

                <input
                    type="search"
                    name="search"
                    value="<?= htmlspecialchars($search) ?>"
                    placeholder="Search by order number, customer, email, phone or status..."
                >

                <button
                    type="submit"
                    class="btn"
                >
                    Search
                </button>

                <?php if (!empty($search)): ?>

                    <a
                        href="orders.php"
                        class="btn btn-secondary"
                    >
                        Clear
                    </a>

                <?php endif; ?>

            </form>


            <!-- ORDERS -->

            <?php if (
                $orders &&
                $orders->num_rows > 0
            ): ?>

                <?php while (
                    $order =
                    $orders->fetch_assoc()
                ): ?>

                    <?php
                        $items = getOrderItems(
                            $conn,
                            $order["id"]
                        );
                    ?>

                    <div class="order">

                        <!-- ORDER HEADER -->

                        <div class="order-header">

                            <div>

                                <div class="order-number">
                                    Order #<?= $order["id"] ?>
                                </div>

                                <div class="order-date">

                                    <?= date(
                                        "d M Y, h:i A",
                                        strtotime(
                                            $order["created_at"]
                                        )
                                    ) ?>

                                </div>

                            </div>


                            <span class="status">

                                <?= htmlspecialchars(
                                    $order["status"]
                                ) ?>

                            </span>

                        </div>


                        <!-- ORDER BODY -->

                        <div class="order-body">


                            <!-- CUSTOMER INFORMATION -->

                            <div class="customer-grid">

                                <div class="customer-box">

                                    <strong>
                                        CUSTOMER
                                    </strong>

                                    <span>
                                        <?= htmlspecialchars(
                                            $order["customer_name"]
                                        ) ?>
                                    </span>

                                </div>


                                <div class="customer-box">

                                    <strong>
                                        EMAIL
                                    </strong>

                                    <span>
                                        <?= htmlspecialchars(
                                            $order["email"]
                                        ) ?>
                                    </span>

                                </div>


                                <div class="customer-box">

                                    <strong>
                                        PHONE
                                    </strong>

                                    <span>
                                        <?= htmlspecialchars(
                                            $order["phone"]
                                        ) ?>
                                    </span>

                                </div>


                                <div class="customer-box">

                                    <strong>
                                        DELIVERY ADDRESS
                                    </strong>

                                    <span>
                                        <?= nl2br(
                                            htmlspecialchars(
                                                $order["address"]
                                            )
                                        ) ?>
                                    </span>

                                </div>

                            </div>


                            <!-- ORDER ITEMS -->

                            <div class="items">

                                <h3>
                                    Ordered Products
                                </h3>


                                <?php if (!empty($items)): ?>

                                    <?php foreach (
                                        $items as $item
                                    ): ?>

                                        <div class="item-row">

                                            <div>

                                                <div class="item-name">

                                                    <?= htmlspecialchars(
                                                        $item["product_name"]
                                                    ) ?>

                                                </div>

                                                <div class="item-meta">

                                                    <?= number_format(
                                                        $item["quantity"]
                                                    ) ?>

                                                    ×

                                                    ₦<?= number_format(
                                                        $item["price"],
                                                        2
                                                    ) ?>

                                                </div>

                                            </div>


                                            <div class="item-price">

                                                ₦<?= number_format(
                                                    $item["price"] *
                                                    $item["quantity"],
                                                    2
                                                ) ?>

                                            </div>

                                        </div>

                                    <?php endforeach; ?>

                                <?php else: ?>

                                    <p>
                                        No order items found.
                                    </p>

                                <?php endif; ?>

                            </div>


                            <!-- ORDER FOOTER -->

                            <div class="order-footer">

                                <div class="total">

                                    Total:

                                    ₦<?= number_format(
                                        $order["total"],
                                        2
                                    ) ?>

                                </div>


                                <form
                                    method="POST"
                                    class="status-form"
                                >

                                    <input
                                        type="hidden"
                                        name="order_id"
                                        value="<?= $order["id"] ?>"
                                    >

                                    <select
                                        name="status"
                                    >

                                        <option
                                            value="Pending"
                                            <?= $order["status"] === "Pending"
                                                ? "selected"
                                                : ""
                                            ?>
                                        >
                                            Pending
                                        </option>

                                        <option
                                            value="Processing"
                                            <?= $order["status"] === "Processing"
                                                ? "selected"
                                                : ""
                                            ?>
                                        >
                                            Processing
                                        </option>

                                        <option
                                            value="Shipped"
                                            <?= $order["status"] === "Shipped"
                                                ? "selected"
                                                : ""
                                            ?>
                                        >
                                            Shipped
                                        </option>

                                        <option
                                            value="Delivered"
                                            <?= $order["status"] === "Delivered"
                                                ? "selected"
                                                : ""
                                            ?>
                                        >
                                            Delivered
                                        </option>

                                        <option
                                            value="Cancelled"
                                            <?= $order["status"] === "Cancelled"
                                                ? "selected"
                                                : ""
                                            ?>
                                        >
                                            Cancelled
                                        </option>

                                    </select>


                                    <button
                                        type="submit"
                                        name="update_status"
                                        class="btn"
                                    >
                                        Update
                                    </button>

                                </form>


                                <form
                                    method="POST"
                                    onsubmit="return confirm('Delete this order permanently?');"
                                >

                                    <input
                                        type="hidden"
                                        name="order_id"
                                        value="<?= $order["id"] ?>"
                                    >

                                    <button
                                        type="submit"
                                        name="delete_order"
                                        class="delete-btn"
                                    >
                                        Delete Order
                                    </button>

                                </form>

                            </div>

                        </div>

                    </div>

                <?php endwhile; ?>

            <?php else: ?>

                <div class="empty">

                    <h3>
                        No orders found
                    </h3>

                    <p>
                        Customer orders will appear here after checkout.
                    </p>

                </div>

            <?php endif; ?>

        </section>

    </main>

</div>

</body>

</html>

<?php

$conn->close();

?>
